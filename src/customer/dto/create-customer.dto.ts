import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsNotEmpty()
  @Min(3)
  @Type(() => String)
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @Type(() => String)
  email: string;
}
