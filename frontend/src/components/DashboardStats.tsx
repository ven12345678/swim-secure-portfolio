import React from 'react';
import { Activity, Users, AlertTriangle, Clock } from 'lucide-react';

interface DashboardStatsProps {
  totalIncidents: number;
  totalPersons: number;
  lastEventTime: string | null;
  currentMaxRisk: number;
}

export default function DashboardStats({ totalIncidents, totalPersons, lastEventTime, currentMaxRisk }: DashboardStatsProps) {
  
  const stats = [
    {
      title: "Total Incidents Detected",
      value: totalIncidents,
      icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
      color: "border-red-500/30 bg-red-500/10",
      text: "text-red-500"
    },
    {
      title: "Persons in Pool",
      value: totalPersons,
      icon: <Users className="w-6 h-6 text-blue-500" />,
      color: "border-blue-500/30 bg-blue-500/10",
      text: "text-blue-500"
    },
    {
      title: "Last Event Time",
      value: lastEventTime || "--:--:--",
      icon: <Clock className="w-6 h-6 text-neutral-400" />,
      color: "border-neutral-700 bg-neutral-800",
      text: "text-neutral-300"
    },
    {
      title: "Max Current Risk",
      value: `${currentMaxRisk}%`,
      icon: <Activity className="w-6 h-6 text-orange-500" />,
      color: "border-orange-500/30 bg-orange-500/10",
      text: "text-orange-500"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {stats.map((stat, idx) => (
        <div key={idx} className={`p-6 rounded-2xl border backdrop-blur-md transition-all duration-300 hover:scale-[1.02] ${stat.color} flex flex-col justify-between h-32`}>
          <div className="flex justify-between items-start">
            <h3 className="text-sm font-medium text-neutral-400">{stat.title}</h3>
            {stat.icon}
          </div>
          <p className={`text-3xl font-bold ${stat.text}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
