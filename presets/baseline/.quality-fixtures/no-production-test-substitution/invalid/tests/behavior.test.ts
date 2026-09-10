import { spyOn as replace, mock as modules } from 'bun:test';
import * as bunTest from 'bun:test';
import * as pricing from '../src/pricing.ts';
import { PricingService } from '@/system/pricing/service';

replace(pricing, 'calculate').mockReturnValue(99);
const target = pricing;
const alias = bunTest.spyOn;
alias(target, 'calculate');
const { spyOn: destructuredSpy } = bunTest;
destructuredSpy(pricing, 'calculate');
modules.module('../src/pricing.ts', () => ({ calculate: () => 99 }));
bunTest.mock.module('@/system/pricing/service', () => ({}));
modules.module(process.argv[2], () => ({}));
pricing.calculate = () => 99;
Object.assign(pricing, { calculate: () => 99 });
Reflect.defineProperty(pricing, 'calculate', { value: () => 99 });
replace(new PricingService(), 'calculate');
