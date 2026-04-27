import { TopBar } from '@/components/sidebar/TopBar';
import { getBrand } from '@/lib/marketing/brand';
import { BrandClient } from '@/components/marketing/BrandClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BrandPage() {
  const brand = await getBrand();
  return (
    <>
      <TopBar title="Brand setup" subtitle="Email · Design system" />
      <BrandClient initialBrand={brand} />
    </>
  );
}
