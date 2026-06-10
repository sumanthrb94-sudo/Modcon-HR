import { useNavigate } from 'react-router-dom';
import type { Employee } from '@/types';
import { Avatar, Badge, statusTone } from '@/components/ui';
import { MapPin, Briefcase } from 'lucide-react';

interface EmployeeCardProps {
  employee: Employee;
}

export function EmployeeCard({ employee }: EmployeeCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/employees/${employee.id}`)}
      className="card p-5 cursor-pointer hover:shadow-card-hover hover:border-brand-200 border border-transparent transition-all group"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="relative">
          <Avatar name={employee.fullName} size="lg" />
          <span
            className={
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ' +
              (employee.status === 'Active' ? 'bg-emerald-400' : 'bg-ink-300')
            }
          />
        </div>
        <div className="w-full">
          <p className="font-semibold text-ink-900 text-sm group-hover:text-brand-700 transition-colors truncate">
            {employee.fullName}
          </p>
          <p className="text-xs text-ink-500 mt-0.5 truncate">{employee.designation}</p>
        </div>
        <Badge tone={statusTone(employee.status)} dot>
          {employee.status}
        </Badge>
        <div className="w-full space-y-1 text-left">
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Briefcase size={11} className="shrink-0 text-ink-400" />
            <span className="truncate">{employee.department}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <MapPin size={11} className="shrink-0 text-ink-400" />
            <span className="truncate">{employee.location}</span>
          </div>
        </div>
        <p className="text-[10px] text-ink-400 font-mono self-start">{employee.employeeCode}</p>
      </div>
    </div>
  );
}
