'use client';

import React from 'react';
import DepartmentFilesPage from '@/app/components/DepartmentFilesPage';

// Finance department id in the seeded database.
const FINANCE_DEPT_ID = 1;

export default function FinanceDashboardPage() {
  return (
    <DepartmentFilesPage
      departmentName="Finance Department"
      departmentId={FINANCE_DEPT_ID}
      accent="#00bcd4"
    />
  );
}
