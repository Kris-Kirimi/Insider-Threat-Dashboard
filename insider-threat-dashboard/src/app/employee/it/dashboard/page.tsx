'use client';

import React from 'react';
import DepartmentFilesPage from '@/app/components/DepartmentFilesPage';

// IT department id in the seeded database.
const IT_DEPT_ID = 2;

export default function ITDashboardPage() {
  return (
    <DepartmentFilesPage
      departmentName="IT Department"
      departmentId={IT_DEPT_ID}
      accent="#7c4dff"
    />
  );
}
