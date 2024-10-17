import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { NatsModule } from 'src/transports/nats.module';

@Module({
  controllers: [CustomerController],
  providers: [CustomerService, PrismaService],
  imports: [NatsModule],
})
export class CustomerModule {}
