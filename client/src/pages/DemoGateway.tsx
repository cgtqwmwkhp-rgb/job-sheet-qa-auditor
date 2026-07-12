import React from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Wrench, ArrowRight, FileCheck } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Demo Gateway Page - Plantexpand Style Guide
 *
 * Clean white background, no gradients
 * Lime green accents for primary actions
 * Border-based cards (no shadows)
 * Professional typography
 */
export default function DemoGateway() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = (role: UserRole) => {
    login(role);
    if (role === "technician") {
      setLocation("/portal/dashboard");
    } else {
      setLocation("/");
    }
  };

  const roles = [
    {
      id: "admin",
      title: "Admin / QA Lead",
      description: "Full access to dashboards, analytics, and configuration.",
      icon: ShieldCheck,
      iconBg: "bg-[rgba(190,218,65,0.15)]",
      iconColor: "text-foreground",
      features: ["Executive Dashboard", "Template Studio", "User Control"],
      primary: true,
    },
    {
      id: "technician",
      title: "Field Technician",
      description: "Mobile-optimized view for engineers to check scores.",
      icon: Wrench,
      iconBg: "bg-[rgba(40,104,206,0.1)]",
      iconColor: "text-[oklch(0.55_0.18_250)]" /* brand blue */,
      features: ["Personal Scorecard", "Dispute Findings", "Mobile View"],
      primary: false,
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-[rgba(190,218,65,0.15)] mb-4">
            <FileCheck className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Job Sheet QA Auditor
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Experience the future of automated compliance. Select a role to
            explore the platform.
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid md:grid-cols-2 gap-6 mt-10">
          {roles.map((role, index) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
            >
              <Card
                className="h-full cursor-pointer transition-all duration-150 border hover:border-primary group"
                onClick={() => handleLogin(role.id as UserRole)}
              >
                <CardHeader className="pb-2">
                  <div
                    className={`h-12 w-12 rounded-lg ${role.iconBg} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-150`}
                  >
                    <role.icon className={`h-6 w-6 ${role.iconColor}`} />
                  </div>
                  <CardTitle className="text-xl font-semibold text-foreground">
                    {role.title}
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                    {role.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <ul className="space-y-2.5 mb-6">
                    {role.features.map((feature, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2.5 text-sm text-foreground/80"
                      >
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${role.primary ? "bg-primary" : "bg-[oklch(0.55_0.18_250)]"}`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={role.primary ? "default" : "outline"}
                  >
                    Enter Demo{" "}
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center text-sm text-muted-foreground pt-6">
          <p>No password required. This is a live interactive demo.</p>
        </div>
      </div>
    </div>
  );
}
