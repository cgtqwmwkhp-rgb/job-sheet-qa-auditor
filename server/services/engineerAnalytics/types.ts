/**
 * Engineer Analytics Types
 * 
 * Types for tracking engineer performance, feedback, and trends.
 * Supports Fix Pack generation and coaching recommendations.
 */

/**
 * Engineer profile for analytics
 */
export interface EngineerProfile {
  id: string;
  name: string;
  employeeId: string;
  region?: string;
  team?: string;
  startDate: string;
  isActive: boolean;
}

/**
 * Issue occurrence for trend tracking
 */
export interface IssueOccurrence {
  id: string;
  engineerId: string;
  documentId: string;
  issueType: IssueType;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  fieldName: string;
  reasonCode: string;
  occurredAt: string;
  wasDisputed: boolean;
  wasWaived: boolean;
  resolutionStatus: 'open' | 'resolved' | 'waived' | 'disputed';
}

/**
 * Canonical issue types
 */
export type IssueType = 
  | 'MISSING_FIELD'
  | 'INVALID_FORMAT'
  | 'OUT_OF_POLICY'
  | 'SIGNATURE_MISSING'
  | 'DATE_MISMATCH'
  | 'PHOTO_QUALITY'
  | 'INCOMPLETE_CHECKLIST'
  | 'OTHER';

/**
 * Engineer score card
 */
export interface EngineerScoreCard {
  engineerId: string;
  engineerName: string;
  period: {
    start: string;
    end: string;
  };
  
  // Overall metrics
  overallScore: number;           // 0-100
  trend: 'improving' | 'stable' | 'declining';
  
  // Document metrics
  documentsProcessed: number;
  documentsWithIssues: number;
  issueRate: number;              // 0-1
  
  // Issue breakdown by severity
  issuesBySeverity: {
    S0: number;
    S1: number;
    S2: number;
    S3: number;
  };
  
  // Issue breakdown by type
  issuesByType: IssueTypeCount[];
  
  // Top recurring issues
  topRecurringIssues: RecurringIssue[];
  
  // Comparison to peers
  peerComparison: {
    percentile: number;           // 0-100
    teamAvgScore: number;
    regionAvgScore: number;
  };
  
  // Coaching recommendations
  recommendations: CoachingRecommendation[];
}

/**
 * Issue type count
 */
export interface IssueTypeCount {
  issueType: IssueType;
  count: number;
  percentage: number;
}

/**
 * Recurring issue pattern
 */
export interface RecurringIssue {
  issueType: IssueType;
  fieldName: string;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  isRecent: boolean;
}

/**
 * Coaching recommendation
 */
export interface CoachingRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'documentation' | 'process' | 'quality' | 'training';
  title: string;
  description: string;
  relatedIssueTypes: IssueType[];
  suggestedActions: string[];
}

/**
 * Fix Pack - targeted training/coaching package
 */
export interface FixPack {
  id: string;
  engineerId: string;
  engineerName: string;
  generatedAt: string;
  validUntil: string;
  
  // Summary
  summary: {
    totalIssues: number;
    criticalIssues: number;
    focusAreas: string[];
  };
  
  // Detailed issues to address
  issues: FixPackIssue[];
  
  // Training modules
  trainingModules: TrainingModule[];
  
  // Acknowledgment tracking
  acknowledgment: {
    required: boolean;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
  };
}

/**
 * Fix Pack issue item
 */
export interface FixPackIssue {
  issueType: IssueType;
  fieldName: string;
  occurrenceCount: number;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  examples: FixPackExample[];
  correctProcedure: string;
}

/**
 * Example for Fix Pack
 */
export interface FixPackExample {
  documentId: string;
  date: string;
  description: string;
  whatWentWrong: string;
  correctApproach: string;
}

/**
 * Training module reference
 */
export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  url?: string;
  relatedIssueTypes: IssueType[];
}

/**
 * Trend analytics result
 */
export interface TrendAnalytics {
  period: {
    start: string;
    end: string;
    granularity: 'day' | 'week' | 'month';
  };
  
  // Overall trends
  overallTrend: {
    direction: 'improving' | 'stable' | 'declining';
    changePercent: number;
  };
  
  // Time series data
  timeSeries: TrendDataPoint[];
  
  // Issue type trends
  issueTypeTrends: IssueTypeTrend[];
  
  // Top improving engineers
  topImproving: EngineerTrendSummary[];
  
  // Engineers needing attention
  needingAttention: EngineerTrendSummary[];
}

/**
 * Trend data point
 */
export interface TrendDataPoint {
  date: string;
  documentsProcessed: number;
  issueCount: number;
  issueRate: number;
  avgScore: number;
}

/**
 * Issue type trend
 */
export interface IssueTypeTrend {
  issueType: IssueType;
  currentCount: number;
  previousCount: number;
  changePercent: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

/**
 * Engineer trend summary
 */
export interface EngineerTrendSummary {
  engineerId: string;
  engineerName: string;
  currentScore: number;
  previousScore: number;
  changePercent: number;
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Default training modules
 */
export function getDefaultTrainingModules(): TrainingModule[] {
  return [
    {
      id: 'tm-001',
      title: 'Job Sheet Documentation Best Practices',
      description: 'Comprehensive guide to completing job sheets accurately',
      estimatedMinutes: 30,
      relatedIssueTypes: ['MISSING_FIELD', 'INCOMPLETE_CHECKLIST'],
    },
    {
      id: 'tm-002',
      title: 'Customer Signature Requirements',
      description: 'Understanding when and how to obtain customer signatures',
      estimatedMinutes: 15,
      relatedIssueTypes: ['SIGNATURE_MISSING'],
    },
    {
      id: 'tm-003',
      title: 'Date and Time Recording Standards',
      description: 'Proper date/time formats and recording procedures',
      estimatedMinutes: 10,
      relatedIssueTypes: ['INVALID_FORMAT', 'DATE_MISMATCH'],
    },
    {
      id: 'tm-004',
      title: 'Photo Documentation Guidelines',
      description: 'Taking clear, compliant photos for job documentation',
      estimatedMinutes: 20,
      relatedIssueTypes: ['PHOTO_QUALITY'],
    },
    {
      id: 'tm-005',
      title: 'Policy Compliance Overview',
      description: 'Understanding company policies and compliance requirements',
      estimatedMinutes: 45,
      relatedIssueTypes: ['OUT_OF_POLICY'],
    },
  ];
}
