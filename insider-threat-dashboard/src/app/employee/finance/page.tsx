'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Department-specific login pages have been consolidated into the single
// /login entrance. This route now just forwards there.
export default function FinanceEntry() {
  const router = useRouter();
  useEffect(() => { router.replace('/login'); }, [router]);
  return null;
}
