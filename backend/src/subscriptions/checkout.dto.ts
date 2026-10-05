import { IsIn, IsOptional } from 'class-validator';

export class CheckoutDto {
  // 'PLUS' | 'PREMIUM'. The Phase 13 shorthand 'monthly' | 'annual' (= Plus, the
  // original single paid tier before Plus/Premium existed as two tiers) is still
  // accepted.
  @IsIn(['PLUS', 'PREMIUM', 'monthly', 'annual'])
  plan: 'PLUS' | 'PREMIUM' | 'monthly' | 'annual';

  @IsOptional()
  @IsIn(['monthly', 'annual'])
  interval?: 'monthly' | 'annual';
}