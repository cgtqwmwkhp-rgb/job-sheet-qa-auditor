import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronRight, 
  ChevronLeft, 
  X, 
  LayoutDashboard, 
  BarChart3, 
  BrainCircuit, 
  Settings,
  Book
} from "lucide-react";
import { useLocation } from "wouter";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  targetPath: string;
  image?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Job Sheet QA",
    description: "Your new command center for automated audit compliance and operational excellence. Let's take a quick tour of the key features.",
    icon: <LayoutDashboard className="h-12 w-12 text-primary" />,
    targetPath: "/"
  },
  {
    title: "First Fix Analysis",
    description: "Track return visits and identify 'Lemon' assets. Use the AI-driven insights to spot patterns in engineer performance and site access issues.",
    icon: <BarChart3 className="h-12 w-12 text-blue-500" />,
    targetPath: "/analytics/first-fix"
  },
  {
    title: "AI Auditor Persona",
    description: "Configure the AI's 'lens'—adjust strictness, tone, and focus areas to match your specific compliance requirements.",
    icon: <BrainCircuit className="h-12 w-12 text-purple-500" />,
    targetPath: "/settings"
  },
  {
    title: "Technician Portal",
    description: "Empower your team with their own dashboard to view scores, dispute findings, and manage notification preferences.",
    icon: <Settings className="h-12 w-12 text-green-500" />,
    targetPath: "/portal/dashboard"
  },
  {
    title: "Help & Resources",
    description: "Access comprehensive guides, FAQs, and best practices in our new Knowledge Base. Master the platform at your own pace.",
    icon: <Book className="h-12 w-12 text-orange-500" />,
    targetPath: "/help"
  }
];

export function OnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check if user has seen the tour
    const hasSeenTour = localStorage.getItem("hasSeenOnboardingTour");
    if (!hasSeenTour) {
      // Small delay to allow app to load
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      // Navigate to the relevant page for context
      setLocation(TOUR_STEPS[nextStep].targetPath);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      setLocation(TOUR_STEPS[prevStep].targetPath);
    }
  };

  const handleComplete = () => {
    setIsOpen(false);
    localStorage.setItem("hasSeenOnboardingTour", "true");
    // Return to dashboard
    setLocation("/");
  };

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden gap-0 border-none shadow-2xl">
        {/* Header Image/Icon Area */}
        <div className="bg-muted/30 h-40 flex items-center justify-center border-b relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <div className="relative z-10 bg-background p-6 rounded-full shadow-lg ring-4 ring-background/50">
            {step.icon}
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-2 right-2 rounded-full hover:bg-background/50"
            onClick={handleComplete}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2 text-center">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              {step.title}
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              {step.description}
            </DialogDescription>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Step {currentStep + 1} of {TOUR_STEPS.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </div>

        <DialogFooter className="p-6 pt-0 sm:justify-between flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={handleNext} className="gap-2 min-w-[100px]">
            {currentStep === TOUR_STEPS.length - 1 ? "Get Started" : "Next"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
