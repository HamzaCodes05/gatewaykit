import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

class MessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MinLength(1) @MaxLength(100_000) content: string;
}

export class ChatDto {
  @IsString() model: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => MessageDto)
  messages: MessageDto[];

  @IsOptional() @IsString() @MaxLength(20_000) system?: string;
  @IsOptional() @IsInt() @Min(1) @Max(8192) max_tokens?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) temperature?: number;
  @IsOptional() @IsBoolean() stream?: boolean;
}

export class CreateKeyDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) rpmLimit?: number;
  /** Omit or null for unlimited. */
  @IsOptional() @IsNumber() @Min(0.0001) monthlyBudgetUsd?: number | null;
}
