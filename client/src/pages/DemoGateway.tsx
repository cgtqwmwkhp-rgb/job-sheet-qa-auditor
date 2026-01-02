import React from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Users, Wrench, ArrowRight, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";

export default function DemoGateway() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = (role: UserRole) => {
    login(role);
    if (role === 'technician') {
      setLocation('/portal/dashboard');
    } else {
      setLocation('/');
    }
  };

  const roles = [
    {
      id: 'admin',
      title: 'Admin / QA Lead',
      description: 'Full access to dashboards, analytics, and configuration.',
      icon: ShieldCheck,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      borderColor: 'hover:border-blue-500',
      features: ['Executive Dashboard', 'Spec Management', 'User Control']
    },
    {
      id: 'technician',
      title: 'Field Technician',
      description: 'Mobile-optimized view for engineers to check scores.',
      icon: Wrench,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
      borderColor: 'hover:border-green-500',
      features: ['Personal Scorecard', 'Dispute Findings', 'Mobile View']
    }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      <div className="max-w-4xl w-full space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-4">
            <LayoutDashboard className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Job Sheet QA Auditor
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience the future of automated compliance. Select a role to explore the platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-12">
          {roles.map((role, index) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card 
                className={`h-full cursor-pointer transition-all duration-300 hover:shadow-xl border-2 border-transparent ${role.borderColor} group`}
                onClick={() => handleLogin(role.id as UserRole)}
              >
                <CardHeader>
                  <div className={`h-14 w-14 rounded-xl ${role.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <role.icon className={`h-7 w-7 ${role.color}`} />
                  </div>
                  <CardTitle className="text-2xl">{role.title}</CardTitle>
                  <CardDescription className="text-base">{role.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-8">
                    {role.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className={`h-1.5 w-1.5 rounded-full ${role.bg.replace('/30', '')}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full group-hover:translate-x-1 transition-transform" variant={index === 0 ? "default" : "outline"}>
                    Enter Demo <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="text-center text-sm text-muted-foreground pt-8">
          <p>No password required. This is a live interactive demo.</p>
        </div>
      </div>
    </div>
  );
}
