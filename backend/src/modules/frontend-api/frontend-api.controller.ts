import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateBindingDto } from './dto/create-binding.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateFeeItemDto } from './dto/create-fee-item.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FrontendApiService } from './frontend-api.service';

@Controller()
export class FrontendApiController {
  constructor(private readonly frontendApi: FrontendApiService) {}

  @Get('bootstrap')
  bootstrap() {
    return this.frontendApi.bootstrap();
  }

  @Post('rooms')
  createRoom(@Body() dto: CreateRoomDto) {
    return this.frontendApi.createRoom(dto);
  }

  @Post('customers')
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.frontendApi.createCustomer(dto);
  }

  @Post('bindings')
  createBinding(@Body() dto: CreateBindingDto) {
    return this.frontendApi.createBinding(dto);
  }

  @Post('transactions')
  createTransaction(@Body() dto: CreateTransactionDto) {
    return this.frontendApi.createTransaction(dto);
  }

  @Post('documents')
  createDocument(@Body() dto: CreateDocumentDto) {
    return this.frontendApi.createDocument(dto);
  }

  @Post('fee-items')
  createFeeItem(@Body() dto: CreateFeeItemDto) {
    return this.frontendApi.createFeeItem(dto);
  }

  @Post('reset')
  reset() {
    return this.frontendApi.reset();
  }
}
