'use client';

import React from 'react';
import DepartmentFilesPage from '@/app/components/DepartmentFilesPage';

export default function FinanceDashboardPage() {
  // Addressed by name rather than a hardcoded id, so the page does not depend
  // on seed ordering.
  return <DepartmentFilesPage departmentName="Finance" accent="#00bcd4" />;
}
