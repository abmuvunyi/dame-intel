import { IsIn, IsOptional } from 'class-validator';

export class CheckoutDto {
  // 'PREMIUM' | 'PRO'. The Phase 13 shorthand 'monthly' | 'annual' (= Premium) is still accepted.
  @IsIn(['PREMIUM', 'PRO', 'monthly', 'annual'])
  plan: 'PREMIUM' | 'PRO' | 'monthly' | 'annual';

  @IsOptional()
  @IsIn(['monthly', 'annual'])
  interval?: 'monthly' | 'annual';
}
