import { useNavigate } from 'react-router-dom';
import type { Employee } from '@/types';
import { Avatar } from '@/components/ui';
import { Badge, statusTone } from '@/components/ui';
import { cn } from '@/lib/utils';

interface OrgNodeProps {
  employee: Employee;
  allEmployees: Employee[];
  depth: number;
  maxDepth?: number;
}

function OrgNode({ employee, allEmployees, depth, maxDepth = 4 }: OrgNodeProps) {
  const navigate = useNavigate();
  const directReports = allEmployees.filter((e) => e.reportingManagerId === employee.id);

  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <div
        onClick={() => navigate(`/employees/${employee.id}`)}
        className={cn(
          'cursor-pointer group flex flex-col items-center gap-2 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-brand-300 transition-all w-[160px]',
          depth === 0 && 'border-brand-400 ring-2 ring-brand-100 bg-brand-50',
        )}
      >
        <Avatar name={employee.fullName} size={depth === 0 ? 'lg' : 'md'} />
        <div className="text-center w-full">
          <p className="text-xs font-semibold text-ink-900 truncate leading-tight">{employee.fullName}</p>
          <p className="text-[10px] text-ink-500 truncate mt-0.5 leading-tight">{employee.designation}</p>
          <div className="mt-1.5">
            <Badge tone={statusTone(employee.status)} className="text-[10px] px-1.5 py-0.5">
              {employee.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Children */}
      {directReports.length > 0 && depth < maxDepth && (
        <div className="flex flex-col items-center">
          {/* Vertical connector */}
          <div className="w-px h-6 bg-ink-300" />
          {/* Horizontal bar spanning children */}
          {directReports.length > 1 && (
            <div
              className="h-px bg-ink-300"
              style={{ width: `${directReports.length * 180 - 20}px` }}
            />
          )}
          {/* Children row */}
          <div className="flex items-start gap-5">
            {directReports.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-6 bg-ink-300" />
                <OrgNode
                  employee={child}
                  allEmployees={allEmployees}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {directReports.length > 0 && depth >= maxDepth && (
        <div className="mt-2">
          <span className="text-xs text-ink-400 italic">+{directReports.length} more</span>
        </div>
      )}
    </div>
  );
}

interface OrgChartProps {
  employees: Employee[];
}

export function OrgChart({ employees }: OrgChartProps) {
  const root = employees.find((e) => e.reportingManagerId === null);

  if (!root) {
    return (
      <div className="py-12 text-center text-ink-400">
        No root node found. Ensure at least one employee has no reporting manager.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto py-8 px-4">
      <div className="flex justify-center min-w-max">
        <OrgNode employee={root} allEmployees={employees} depth={0} maxDepth={3} />
      </div>
    </div>
  );
}
