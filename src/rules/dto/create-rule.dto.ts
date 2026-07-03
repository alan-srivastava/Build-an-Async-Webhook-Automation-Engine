import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ConditionDto {
  @IsString()
  field: string;

  @IsIn(['equals', 'gt', 'contains'])
  operator: 'equals' | 'gt' | 'contains';

  value: any;
}

class ActionConfigDto {
  @IsIn(['http_notify', 'crm_update'])
  type: 'http_notify' | 'crm_update';

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;
}

export class CreateRuleDto {
  @IsString()
  name: string;

  @IsString()
  source: string;

  @IsString()
  eventType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions: ConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionConfigDto)
  actions: ActionConfigDto[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
