import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Customer } from '@prisma/client';

import { firstValueFrom } from 'rxjs';
import { ListResponse, PaginationDto, Role, User, UserSummary } from 'src/common';
import { NATS_SERVICE } from 'src/config';
import { ExceptionHandler, hasRoles, ObjectManipulator } from 'src/helpers';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';
import { CustomerResponse } from './interfaces/customer.interface';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name, { timestamp: true });
  private readonly customer = this.prismaService.customer;
  private readonly exHandler = new ExceptionHandler(this.logger, CustomerService.name);

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {}

  health() {
    return 'Customer service is up and running!';
  }

  async create(createCustomerDto: CreateCustomerDto, user: User): Promise<CustomerResponse> {
    this.logger.log(`Create customer: ${JSON.stringify(createCustomerDto)}, user: ${JSON.stringify(user)}`);
    try {
      const data = await this.customer.create({ data: { ...createCustomerDto, createdById: user.id } });
      const [computedData] = await this.getUsers([data], user);
      return computedData;
    } catch (error) {
      throw this.exHandler.handleException(error);
    }
  }

  async findAll(pagination: PaginationDto, user: User): Promise<ListResponse<CustomerResponse>> {
    this.logger.log(`Find all customers: ${JSON.stringify(pagination)}, user: ${JSON.stringify(user)}`);
    const { page, limit } = pagination;
    const isAdmin = hasRoles(user.roles, [Role.Admin]);

    const where = isAdmin ? {} : { deletedAt: null };
    const [total, data] = await Promise.all([
      this.customer.count({ where }),
      this.customer.findMany({ take: limit, skip: (page - 1) * limit, where, orderBy: { createdAt: 'desc' } }),
    ]);
    const lastPage = Math.ceil(total / limit);

    const computedData = data.map((item) =>
      ObjectManipulator.exclude(item, ['createdById', 'deletedById', 'updatedById']),
    );

    return { meta: { total, page, lastPage }, data: computedData };
  }

  async findOne(id: string, user: User): Promise<CustomerResponse> {
    this.logger.log(`Find one customer: ${id}, user: ${JSON.stringify(user)}`);
    const isAdmin = hasRoles(user.roles, [Role.Admin]);
    const where = isAdmin ? { id } : { id, deletedAt: null };
    const data = await this.customer.findUnique({ where });

    if (!data) throw new RpcException({ status: HttpStatus.NOT_FOUND, message: '[ERROR] Customer not found' });

    const [computedData] = await this.getUsers([data], user);

    return computedData;
  }

  async update(updateCustomerDto: UpdateCustomerDto, user: User): Promise<CustomerResponse> {
    this.logger.log(`Update customer: ${JSON.stringify(updateCustomerDto)}, user: ${JSON.stringify(user)}`);

    try {
      const { id, ...data } = updateCustomerDto;
      await this.findOne(id, user);
      const updatedData = await this.customer.update({ where: { id }, data: { ...data, updatedById: user.id } });
      const [computedData] = await this.getUsers([updatedData], user);
      return computedData;
    } catch (error) {
      throw this.exHandler.handleException(error);
    }
  }

  async remove(id: string, user: User): Promise<CustomerResponse> {
    this.logger.log(`Remove customer: ${id}, user: ${JSON.stringify(user)}`);
    try {
      await this.findOne(id, user);
      const updatedData = await this.customer.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: user.id },
      });
      const [computedData] = await this.getUsers([updatedData], user);
      return computedData;
    } catch (error) {
      throw this.exHandler.handleException(error);
    }
  }

  async restore(id: string, user: User): Promise<CustomerResponse> {
    this.logger.log(`Restore customer: ${id}, user: ${JSON.stringify(user)}`);
    try {
      await this.findOne(id, user);
      const updatedData = await this.customer.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
      const [computedData] = await this.getUsers([updatedData], user);
      return computedData;
    } catch (error) {
      throw this.exHandler.handleException(error);
    }
  }

  private async getUsers(data: Customer[], user: User): Promise<CustomerResponse[]> {
    const ids = data.flatMap((item) => [item.createdById, item.deletedById, item.updatedById]).filter(Boolean);
    const uniqueIds = new Set(ids);

    if (!uniqueIds.size) return data;

    const users = await firstValueFrom<UserSummary[]>(
      this.client.send('user.find.ids', { ids: Array.from(uniqueIds), user }),
    );

    const usersMap = new Map(users.map((item) => [item.id, item]));

    return data.map(({ createdById, deletedById, updatedById, ...item }) => ({
      ...item,
      createdBy: usersMap.get(createdById) || null,
      updatedBy: usersMap.get(updatedById) || null,
      deletedBy: usersMap.get(deletedById) || null,
    }));
  }
}
