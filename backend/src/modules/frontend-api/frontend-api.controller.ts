import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { RequirePermission } from '../rbac/permissions.decorator';
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

  @Get('diagnostics')
  diagnostics() {
    return this.frontendApi.diagnostics();
  }

  @Post('rooms')
  @RequirePermission('property:create')
  createRoom(@Body() dto: CreateRoomDto) {
    return this.frontendApi.createRoom(dto);
  }

  @Get('rooms/:id')
  getRoom(@Param('id') id: string) {
    return this.frontendApi.getRoom(id);
  }

  @Put('rooms/:id')
  @RequirePermission('property:update')
  updateRoom(@Param('id') id: string, @Body() dto: CreateRoomDto) {
    return this.frontendApi.updateRoom(id, dto);
  }

  @Delete('rooms/:id')
  @RequirePermission('property:delete')
  deleteRoom(@Param('id') id: string) {
    return this.frontendApi.deleteRoom(id);
  }

  @Post('customers')
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.frontendApi.createCustomer(dto);
  }

  @Put('customers/:id')
  updateCustomer(@Param('id') id: string, @Body() dto: CreateCustomerDto) {
    return this.frontendApi.updateCustomer(id, dto);
  }

  @Delete('customers/:id')
  deleteCustomer(@Param('id') id: string) {
    return this.frontendApi.deleteCustomer(id);
  }

  @Post('bindings')
  createBinding(@Body() dto: CreateBindingDto) {
    return this.frontendApi.createBinding(dto);
  }

  @Put('bindings/:id')
  updateBinding(@Param('id') id: string, @Body() dto: CreateBindingDto) {
    return this.frontendApi.updateBinding(id, dto);
  }

  @Delete('bindings/:id')
  deleteBinding(@Param('id') id: string) {
    return this.frontendApi.deleteBinding(id);
  }

  @Post('transactions')
  @RequirePermission('payment:create')
  createTransaction(@Body() dto: CreateTransactionDto) {
    return this.frontendApi.createTransaction(dto);
  }

  @Put('transactions/:id')
  @RequirePermission('payment:update')
  updateTransaction(@Param('id') id: string, @Body() dto: CreateTransactionDto) {
    return this.frontendApi.updateTransaction(id, dto);
  }

  @Delete('transactions/:id')
  @RequirePermission('payment:delete')
  deleteTransaction(@Param('id') id: string) {
    return this.frontendApi.deleteTransaction(id);
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
