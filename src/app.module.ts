import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { CustomerModule } from './customer/customer.module';

@Module({
  imports: [CustomerModule],
  providers: [PrismaService],
})
export class AppModule {}
