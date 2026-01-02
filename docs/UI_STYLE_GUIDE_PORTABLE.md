# Plantexpand UI Style Guide

> **Version**: 1.0  
> **Source**: PlantEx Assist v3  
> **Last Updated**: December 2024  
> **Purpose**: Portable design specification for consistent UI across Plantexpand applications

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing & Layout](#5-spacing--layout)
6. [Icons](#6-icons)
7. [Components](#7-components)
8. [Animations & Transitions](#8-animations--transitions)
9. [Dark Mode](#9-dark-mode)
10. [Accessibility](#10-accessibility)
11. [Additional Styling](#11-additional-styling)
12. [CSS Variables Reference](#12-css-variables-reference)
13. [Tailwind Configuration](#13-tailwind-configuration)
14. [Color Scheme Options](#14-color-scheme-options)
15. [Implementation Checklist](#15-implementation-checklist)

---

## 1. Overview

This document defines the visual identity and design patterns for Plantexpand applications. It provides a technology-agnostic specification that can be implemented across different frameworks while maintaining visual consistency.

### Design Principles

1. **Clean & Professional** - White backgrounds, minimal shadows, clear typography
2. **High Contrast** - Text is always readable, following WCAG guidelines
3. **Consistent Accents** - Brand colors used sparingly for emphasis
4. **Responsive First** - Mobile-friendly layouts that scale up
5. **Accessible** - Keyboard navigable, screen reader friendly

---

## 2. Tech Stack

The reference implementation uses:

| Technology | Purpose | Version |
|------------|---------|---------|
| **Next.js** | React framework | 14.2.15 |
| **React** | UI library | 18.3.1 |
| **Tailwind CSS** | Utility-first CSS | 3.4.14 |
| **shadcn/ui** | Component library | Latest |
| **Radix UI** | Accessible primitives | Various |
| **Lucide React** | Icon library | 0.454.0 |
| **Inter** | Primary font | Google Fonts |
| **Sonner** | Toast notifications | 1.5.0 |
| **Framer Motion** | Animations | 11.11.9 |

### Key Dependencies

```json
{
  "next": "^14.2.15",
  "react": "^18.3.1",
  "tailwindcss": "^3.4.14",
  "tailwindcss-animate": "^1.0.7",
  "tailwind-merge": "^2.5.4",
  "@radix-ui/react-dialog": "^1.1.2",
  "@radix-ui/react-dropdown-menu": "^2.1.2",
  "@radix-ui/react-select": "^2.1.2",
  "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-radio-group": "^1.3.8",
  "@radix-ui/react-alert-dialog": "^1.1.2",
  "lucide-react": "^0.454.0",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.1.1",
  "sonner": "^1.5.0",
  "framer-motion": "^11.11.9"
}
```

### Utility Function: `cn()`

The codebase uses a utility function to merge Tailwind classes safely:

```typescript
// lib/utils/cn.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Usage:
```tsx
<div className={cn(
  'base-classes here',
  isActive && 'active-classes',
  className
)}>
```

---

## 3. Color System

### 3.1 Brand Colors (Primary Palette)

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Lime Green** | `#BEDA41` | `rgb(190, 218, 65)` | Primary actions, CTAs, active states, success |
| **Lime Green Dark** | `#A8C038` | `rgb(168, 192, 56)` | Hover states on lime |
| **Lime Green Light** | `#D4E86D` | `rgb(212, 232, 109)` | Light highlights |
| **Charcoal** | `#333030` | `rgb(51, 48, 48)` | Primary text, headings, icons |
| **Charcoal Dark** | `#1A1818` | `rgb(26, 24, 24)` | Bold emphasis |
| **Charcoal Light** | `#4A4646` | `rgb(74, 70, 70)` | Secondary text |

### 3.2 Supporting Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Blue** | `#2868CE` | `rgb(40, 104, 206)` | Links, informational, secondary actions |
| **Blue Dark** | `#1E52A3` | `rgb(30, 82, 163)` | Link hover |
| **Blue Light** | `#4A85E0` | `rgb(74, 133, 224)` | Light informational |
| **Red/Crimson** | `#BA3737` | `rgb(186, 55, 55)` | Errors, destructive actions |
| **Red Dark** | `#962C2C` | `rgb(150, 44, 44)` | Error hover |
| **Orange/Amber** | `#D4A337` | `rgb(212, 163, 55)` | Warnings, pending states |
| **Orange Dark** | `#B08A2D` | `rgb(176, 138, 45)` | Warning hover |

### 3.3 Semantic Colors

| Purpose | Default | Light Background |
|---------|---------|------------------|
| **Success** | `#10B981` (Emerald) | `#D1FAE5` |
| **Warning** | `#F59E0B` (Amber) | `#FEF3C7` |
| **Error** | `#EF4444` (Red) | `#FEE2E2` |
| **Info** | `#3B82F6` (Blue) | `#DBEAFE` |

### 3.3.1 Feature/Stream Accent Colors

For multi-feature applications, use these accent colors to differentiate streams or modules:

| Feature | Color | Hex | Tailwind | Usage |
|---------|-------|-----|----------|-------|
| **PAMS / People** | Purple | `#8B5CF6` | `purple-500` | User management, scheduling, teams |
| **Parts / Assets** | Emerald | `#10B981` | `emerald-500` | Equipment, inventory, specifications |
| **Contracts / Docs** | Blue | `#3B82F6` | `blue-500` | Documents, SOPs, procedures |

These can be used for:
- Stream indicator pills
- Feature navigation highlights
- Category badges
- Progress bars by category

```css
/* Stream pill pattern */
.stream-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.stream-pill-pams {
  background-color: rgba(139, 92, 246, 0.15);
  color: #8B5CF6;
}

.stream-pill-parts {
  background-color: rgba(16, 185, 129, 0.15);
  color: #10B981;
}

.stream-pill-contracts {
  background-color: rgba(59, 130, 246, 0.15);
  color: #3B82F6;
}
```

### 3.4 Neutral Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `white` | `#FFFFFF` | Backgrounds, surfaces |
| `gray-50` | `#F9F9F9` | Subtle backgrounds |
| `gray-100` | `#F5F4F4` | Secondary backgrounds |
| `gray-200` | `#EBE8E8` | Borders, dividers (Platinum) |
| `gray-300` | `#D9D7D7` | Stronger borders |
| `gray-400` | `#B5B2B2` | Placeholder text |
| `gray-500` | `#8A8787` | Muted text |
| `gray-600` | `#706D6D` | Secondary text |
| `gray-700` | `#4A4646` | Emphasis |
| `gray-800` | `#333030` | Primary text (Charcoal) |
| `gray-900` | `#1A1818` | Headings |

### 3.5 Color Usage Rules

```
✅ DO:
- Use Charcoal (#333030) for all body text
- Use Lime Green (#BEDA41) for primary buttons and active states
- Use White (#FFFFFF) for all page backgrounds
- Use Platinum (#EBE8E8) only for dividers and subtle borders
- Use Blue (#2868CE) for links

❌ DON'T:
- Use grey backgrounds for pages (always white)
- Use gradients on UI elements
- Apply shadows to cards (use borders instead)
- Mix multiple accent colors in one section
```

### 3.6 Opacity Variants

For subtle variations, use opacity on base colors:

| Variant | Opacity | CSS | Usage |
|---------|---------|-----|-------|
| Hover background | 3% | `#33303008` | Subtle hover state on white |
| Active background | 6% | `#33303010` | Active/pressed state |
| Light accent | 10% | `#BEDA411A` | Subtle lime highlight |
| Medium accent | 20% | `#BEDA4133` | Visible lime background |
| Disabled text | 40% | `#33303066` | Disabled state |
| Secondary text | 50% | `#33303080` | Helper text |

---

## 4. Typography

### 4.1 Font Family

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

**Primary Font**: Inter (Google Fonts)  
**Monospace**: `'JetBrains Mono', 'Fira Code', monospace`

### 4.2 Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | `400` | Body text, labels |
| Medium | `500` | Subheadings, nav items, emphasis |
| Semibold | `600` | Headings, buttons |
| Bold | `700` | Page titles only |

### 4.3 Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| **Page Title** | `24px` / `1.5rem` | 700 | 1.2 | `-0.02em` |
| **Section Heading** | `20px` / `1.25rem` | 600 | 1.3 | `-0.01em` |
| **Card Title** | `16px` / `1rem` | 600 | 1.4 | `0` |
| **Body** | `14px` / `0.875rem` | 400 | 1.5 | `0` |
| **Small** | `12px` / `0.75rem` | 400 | 1.4 | `0` |
| **Caption** | `11px` / `0.6875rem` | 500 | 1.3 | `0.02em` |
| **Section Label** | `10px` / `0.625rem` | 600 | 1.3 | `0.05em` |

### 4.4 Typography CSS

```css
/* Page Title */
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #333030;
}

/* Section Heading */
.section-heading {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: #333030;
}

/* Body Text */
.body-text {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
  color: #333030;
}

/* Helper/Muted Text */
.helper-text {
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  color: #706D6D;
}

/* Section Label (uppercase) */
.section-label {
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #8A8787;
}
```

---

## 5. Spacing & Layout

### 5.1 Base Unit

**Base unit: 4px**

All spacing uses multiples of 4px for consistency.

### 5.2 Spacing Scale

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `1` | `4px` | `p-1` | Tight gaps, icon padding |
| `2` | `8px` | `p-2` | Small gaps, compact elements |
| `3` | `12px` | `p-3` | Default component padding |
| `4` | `16px` | `p-4` | Card padding, section gaps |
| `5` | `20px` | `p-5` | Medium spacing |
| `6` | `24px` | `p-6` | Large section gaps |
| `8` | `32px` | `p-8` | Page margins |
| `10` | `40px` | `p-10` | Major sections |
| `12` | `48px` | `p-12` | Hero sections |
| `16` | `64px` | `p-16` | Extra large spacing |

### 5.3 Layout Measurements

| Element | Value |
|---------|-------|
| Page margin (desktop) | `24px` |
| Page margin (mobile) | `16px` |
| Card padding | `16px` |
| Component gap | `12px` |
| Section gap | `24px` |
| Header height | `64px` / `56px` |
| Sidebar collapsed | `56px` |
| Sidebar expanded | `240px` - `280px` |

### 5.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | `4px` | Tags, badges, small chips |
| `md` | `8px` | Buttons, inputs, dropdowns |
| `lg` | `12px` | Cards, modals, panels |
| `xl` | `16px` | Large cards, featured sections |
| `2xl` | `24px` | Hero elements |
| `full` | `9999px` | Pills, avatars, circular buttons |

### 5.5 Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | `640px` | Mobile landscape |
| `md` | `768px` | Tablet |
| `lg` | `1024px` | Desktop |
| `xl` | `1280px` | Large desktop |
| `2xl` | `1536px` | Wide screens |

---

## 6. Icons

### 6.1 Icon Library

**Library**: [Lucide React](https://lucide.dev) (or Lucide for other frameworks)

Lucide is a fork of Feather Icons with more icons and active development.

### 6.2 Icon Specifications

| Context | Size | Stroke Width | Color |
|---------|------|--------------|-------|
| Navigation | `20px` | `1.5` | Charcoal `#333030` |
| Inline (with text) | `16px` | `1.5` | Charcoal |
| Buttons | `16px` | `1.5` | Inherit from button |
| Large/Hero | `24px` | `1.5` | Charcoal |
| Small indicators | `12px` | `2` | Charcoal |
| Badges/status | `12px` | `2` | Status color |

### 6.3 Common Icons Reference

| Action | Icon Name | Usage |
|--------|-----------|-------|
| Menu | `Menu` | Navigation toggle |
| Close | `X` | Close modals, dismiss |
| Search | `Search` | Search inputs |
| Settings | `Settings` | Configuration |
| User | `User` | User profile, account |
| Send | `Send` | Submit message |
| Upload | `Upload` | File upload |
| Download | `Download` | File download |
| Edit | `Pencil` | Edit action |
| Delete | `Trash2` | Delete action |
| Add | `Plus` | Add/create new |
| Check | `Check` | Success, completed |
| Warning | `AlertTriangle` | Warning state |
| Error | `XCircle` | Error state |
| Info | `Info` | Informational |
| Refresh | `RotateCcw` | Reload/refresh |
| Camera | `Camera` | Photo capture |
| Document | `FileText` | Documents |
| Chat | `MessageSquare` | Messaging |
| Home | `Home` | Home/dashboard |
| Back | `ChevronLeft` | Navigate back |
| Forward | `ChevronRight` | Navigate forward |
| Expand | `ChevronDown` | Expand section |
| Collapse | `ChevronUp` | Collapse section |
| External | `ExternalLink` | External link |
| Copy | `Copy` | Copy to clipboard |
| Bot/AI | `Bot` | AI assistant |
| Lightbulb | `Lightbulb` | Ideas, suggestions |
| Chart | `BarChart3` | Analytics |

### 6.4 Icon Usage in React

```tsx
import { Settings, User, FileText } from 'lucide-react';

// Standard navigation icon
<Settings size={20} strokeWidth={1.5} className="text-[#333030]" />

// Inline with text
<span className="flex items-center gap-2">
  <FileText size={16} strokeWidth={1.5} />
  Documents
</span>

// In button
<button className="flex items-center gap-2 px-4 py-2">
  <User size={16} strokeWidth={1.5} />
  Profile
</button>
```

---

## 7. Components

### 7.1 Buttons

#### Primary Button

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #333030;
  background-color: #BEDA41;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background-color: #A8C038;
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-primary:disabled {
  background-color: #EBE8E8;
  color: #33303066;
  cursor: not-allowed;
  transform: none;
}
```

#### Secondary Button

```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #333030;
  background-color: #FFFFFF;
  border: 1px solid #EBE8E8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover {
  background-color: #33303008;
  border-color: #333030;
}
```

#### Ghost Button

```css
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #333030;
  background-color: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-ghost:hover {
  background-color: #33303008;
}
```

#### Destructive Button

```css
.btn-destructive {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
  background-color: #BA3737;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-destructive:hover {
  background-color: #962C2C;
}
```

#### Button Sizes

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| Small | `36px` | `8px 12px` | `13px` |
| Default | `40px` | `10px 20px` | `14px` |
| Large | `44px` | `12px 24px` | `14px` |
| Icon | `40px × 40px` | `0` | - |

### 7.2 Input Fields

```css
.input {
  width: 100%;
  height: 40px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 400;
  color: #333030;
  background-color: #FFFFFF;
  border: 1px solid #EBE8E8;
  border-radius: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input::placeholder {
  color: #B5B2B2;
}

.input:focus {
  outline: none;
  border-color: #BEDA41;
  box-shadow: 0 0 0 3px rgba(190, 218, 65, 0.2);
}

.input:disabled {
  background-color: #F5F4F4;
  color: #8A8787;
  cursor: not-allowed;
}

.input.error {
  border-color: #BA3737;
  box-shadow: 0 0 0 3px rgba(186, 55, 55, 0.1);
}
```

### 7.3 Cards

```css
.card {
  background-color: #FFFFFF;
  border: 1px solid #EBE8E8;
  border-radius: 12px;
  padding: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #333030;
  margin-bottom: 8px;
}

.card-content {
  font-size: 14px;
  color: #333030;
  line-height: 1.5;
}

/* Interactive card */
.card-interactive {
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.card-interactive:hover {
  border-color: #BEDA41;
}

/* Selected state */
.card-selected {
  border-color: #BEDA41;
  background-color: rgba(190, 218, 65, 0.05);
}
```

### 7.4 Badges & Tags

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.badge-default {
  background-color: #EBE8E8;
  color: #333030;
}

.badge-success {
  background-color: rgba(16, 185, 129, 0.15);
  color: #059669;
}

.badge-warning {
  background-color: rgba(245, 158, 11, 0.15);
  color: #D97706;
}

.badge-error {
  background-color: rgba(239, 68, 68, 0.15);
  color: #DC2626;
}

.badge-info {
  background-color: rgba(40, 104, 206, 0.15);
  color: #2868CE;
}
```

### 7.5 Navigation Sidebar

The sidebar follows this pattern:

```css
/* Sidebar Container */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  background-color: #FFFFFF;
  border-right: 1px solid #E8E6E6;
  transition: width 0.2s ease-out;
}

.sidebar-collapsed {
  width: 56px;
}

.sidebar-expanded {
  width: 240px;
}

/* Toggle button (header) */
.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  background-color: #BEDA41;
  transition: background-color 0.15s ease;
}

.sidebar-toggle:hover {
  background-color: #A8C038;
}

/* Section labels */
.sidebar-section-label {
  padding: 0 16px;
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8A8787;
}

/* Navigation items */
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin: 0 8px;
  border-radius: 8px;
  color: #706D6D;
  font-size: 14px;
  transition: all 0.15s ease;
}

.nav-item:hover {
  background-color: #F5F4F4;
  color: #333030;
}

.nav-item.active {
  background-color: rgba(190, 218, 65, 0.15);
  color: #333030;
}

/* Active indicator dot */
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #BEDA41;
}
```

### 7.6 Modals / Dialogs

```css
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 50;
}

/* Content */
.modal-content {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  width: 100%;
  max-width: 32rem; /* 512px */
  background-color: #FFFFFF;
  border: 1px solid #EBE8E8;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 20px 25px rgba(51, 48, 48, 0.15);
}

/* Header */
.modal-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: #333030;
}

.modal-description {
  font-size: 14px;
  color: #706D6D;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

/* Close button */
.modal-close {
  position: absolute;
  right: 16px;
  top: 16px;
  padding: 4px;
  border-radius: 4px;
  color: #706D6D;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.modal-close:hover {
  opacity: 1;
}
```

### 7.7 Dropdowns

```css
.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #FFFFFF;
  border: 1px solid #EBE8E8;
  border-radius: 8px;
  font-size: 14px;
  color: #333030;
  cursor: pointer;
}

.dropdown-menu {
  background-color: #FFFFFF;
  border: 1px solid #EBE8E8;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(51, 48, 48, 0.1);
  min-width: 180px;
}

.dropdown-item {
  padding: 8px 12px;
  font-size: 14px;
  color: #333030;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.dropdown-item:hover {
  background-color: #F5F4F4;
}

.dropdown-item.active {
  background-color: rgba(190, 218, 65, 0.15);
}

.dropdown-separator {
  height: 1px;
  background-color: #EBE8E8;
  margin: 4px 0;
}
```

### 7.8 Chat Messages

```css
/* User message */
.message-user {
  max-width: 80%;
  margin-left: auto;
  padding: 12px 16px;
  background-color: #BEDA41;
  color: #333030;
  border-radius: 16px 16px 4px 16px;
}

/* AI/Bot message */
.message-bot {
  max-width: 80%;
  padding: 12px 16px;
  background-color: #FFFFFF;
  color: #333030;
  border: 1px solid #EBE8E8;
  border-radius: 16px 16px 16px 4px;
}

/* System notification */
.message-system {
  padding: 8px 12px;
  background-color: #F5F4F4;
  color: #706D6D;
  border-radius: 8px;
  font-size: 12px;
  text-align: center;
}
```

### 7.9 Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table thead {
  background-color: #BEDA41;
  color: #333030;
}

.table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
}

.table td {
  padding: 12px 16px;
  border-bottom: 1px solid #EBE8E8;
  color: #333030;
}

.table tbody tr:hover {
  background-color: #F5F4F4;
}
```

### 7.10 Toast Notifications

Using **Sonner** for toast notifications with custom styling:

```tsx
// Configuration in layout
import { Toaster } from 'sonner';

<Toaster
  position="top-right"
  toastOptions={{
    duration: 4000,
    style: {
      background: 'hsl(var(--background))',
      color: 'hsl(var(--foreground))',
      border: '1px solid hsl(var(--border))',
    },
  }}
/>

// Usage
import { toast } from 'sonner';

// Success
toast.success('Operation completed', {
  description: 'Your changes have been saved.',
});

// Error
toast.error('Something went wrong', {
  description: 'Please try again.',
});

// With custom duration
toast.success('Copied to clipboard', { duration: 2000 });
```

### 7.11 File Upload Zone

Drag-and-drop file upload with dashed border:

```css
.file-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  border: 2px dashed #D9D7D7;
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.file-upload-zone:hover {
  border-color: #BEDA41;
  background-color: rgba(190, 218, 65, 0.05);
}

.file-upload-zone.dragging {
  border-color: #BEDA41;
  background-color: rgba(190, 218, 65, 0.1);
}

.file-upload-zone .icon {
  color: #8A8787;
}

.file-upload-zone .text {
  font-size: 14px;
  color: #8A8787;
}

.file-upload-zone .hint {
  font-size: 12px;
  color: #B5B2B2;
}
```

### 7.12 Loading States

```css
/* Spinning loader icon */
.loader-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Loading button */
.btn-loading {
  position: relative;
  color: transparent;
}

.btn-loading::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #BEDA41;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Skeleton loading */
.skeleton {
  background: linear-gradient(
    90deg,
    #F5F4F4 25%,
    #EBE8E8 50%,
    #F5F4F4 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### 7.13 Selection Cards (Choice Pattern)

For multi-choice selection screens (e.g., wizard step 1):

```css
.choice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

/* Issue/Error choice */
.choice-card-error {
  background-color: #FEF2F2;
}

.choice-card-error:hover {
  border-color: #EF4444;
}

.choice-card-error .icon-container {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: #FEE2E2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: background-color 0.15s ease;
}

.choice-card-error:hover .icon-container {
  background-color: #FECACA;
}

.choice-card-error .icon {
  color: #EF4444;
}

/* Success/Suggestion choice */
.choice-card-success {
  background-color: #F0FDF4;
}

.choice-card-success:hover {
  border-color: #22C55E;
}

.choice-card-success .icon-container {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: #DCFCE7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: background-color 0.15s ease;
}

.choice-card-success:hover .icon-container {
  background-color: #BBF7D0;
}

.choice-card-success .icon {
  color: #22C55E;
}
```

### 7.14 AI Suggestion Cards

For AI-powered suggestions and insights:

```css
/* Category suggestion */
.ai-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #F0F9FF;
  border: 1px solid #BAE6FD;
  border-radius: 8px;
}

.ai-suggestion .icon {
  color: #0EA5E9;
}

.ai-suggestion .text {
  font-size: 12px;
  color: #0369A1;
  flex: 1;
}

.ai-suggestion .action {
  font-size: 12px;
  color: #0EA5E9;
  font-weight: 500;
  cursor: pointer;
}

.ai-suggestion .action:hover {
  text-decoration: underline;
}

/* AI insight/tip */
.ai-insight {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background-color: #FFFBEB;
  border: 1px solid #FDE68A;
  border-radius: 8px;
}

.ai-insight .icon {
  color: #D97706;
  flex-shrink: 0;
  margin-top: 2px;
}

.ai-insight .text {
  font-size: 12px;
  color: #92400E;
}
```

### 7.15 Form Labels

```css
.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333030;
  margin-bottom: 6px;
}

.form-label .required {
  color: #EF4444;
  margin-left: 2px;
}

.form-label .optional {
  color: #8A8787;
  font-weight: 400;
  margin-left: 4px;
}
```

### 7.16 Radio Groups

```css
.radio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.radio-circle {
  width: 16px;
  height: 16px;
  border: 1px solid #BEDA41;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.radio-circle.checked {
  background-color: #BEDA41;
}

.radio-circle.checked::after {
  content: '';
  width: 6px;
  height: 6px;
  background-color: #333030;
  border-radius: 50%;
}

.radio-label {
  font-size: 14px;
  color: #333030;
}
```

---

## 8. Animations & Transitions

### 8.1 Timing

| Speed | Duration | Usage |
|-------|----------|-------|
| Fast | `100ms` | Hover states, toggles |
| Normal | `150ms` | Most transitions |
| Slow | `200ms` | Page transitions, complex animations |
| Deliberate | `300ms` | Modals, sidebars |

### 8.2 Easing Functions

```css
/* Default ease - good for most transitions */
transition-timing-function: ease;

/* Smooth deceleration - for elements entering */
transition-timing-function: cubic-bezier(0, 0, 0.2, 1);

/* Smooth acceleration - for elements exiting */
transition-timing-function: cubic-bezier(0.4, 0, 1, 1);

/* Spring-like - for playful interactions */
transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 8.3 Common Animations

```css
/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide up (for modals, toasts) */
@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(10px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scale in (for dialogs) */
@keyframes scaleIn {
  from { 
    opacity: 0;
    transform: scale(0.95);
  }
  to { 
    opacity: 1;
    transform: scale(1);
  }
}

/* Pulse (for loading states) */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Loading dots */
@keyframes loadingDot {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}
```

### 8.4 Standard Transition

```css
/* Apply to interactive elements */
transition: all 0.15s ease;

/* For color-only changes */
transition: color 0.15s ease, background-color 0.15s ease;

/* For layout changes (width, height) */
transition: width 0.2s ease-out, height 0.2s ease-out;
```

---

## 9. Dark Mode

Dark mode support uses CSS custom properties for easy theming.

### 9.1 Dark Mode Colors

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | `#FFFFFF` | `#0F172A` |
| Surface | `#F5F4F4` | `#1E293B` |
| Border | `#EBE8E8` | `#334155` |
| Text Primary | `#333030` | `#F1F5F9` |
| Text Secondary | `#706D6D` | `#94A3B8` |
| Text Muted | `#8A8787` | `#64748B` |

### 9.2 Dark Mode CSS Variables

```css
.dark {
  --bg-primary: #0F172A;
  --bg-secondary: #1E293B;
  --bg-tertiary: #334155;
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  --border-primary: #334155;
  --border-secondary: #475569;
}
```

### 9.3 Dark Mode Implementation

```css
/* Use prefers-color-scheme for automatic detection */
@media (prefers-color-scheme: dark) {
  :root {
    /* Dark values */
  }
}

/* Or use class-based toggling */
.dark .card {
  background-color: #1E293B;
  border-color: #334155;
  color: #F1F5F9;
}
```

---

## 10. Accessibility

### 10.1 Color Contrast

All text must meet WCAG 2.1 AA standards:

| Combination | Contrast Ratio | Status |
|-------------|----------------|--------|
| Charcoal on White | 11.5:1 | ✅ AAA |
| Charcoal on Lime Green | 7.2:1 | ✅ AAA |
| Blue on White | 4.7:1 | ✅ AA |
| Red on White | 5.1:1 | ✅ AA |

### 10.2 Focus States

All interactive elements must have visible focus indicators:

```css
/* Default focus ring */
:focus-visible {
  outline: 2px solid #BEDA41;
  outline-offset: 2px;
}

/* Alternative with box-shadow */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(190, 218, 65, 0.4);
}
```

### 10.3 Touch Targets

Minimum touch target size: **44px × 44px**

```css
/* Ensure buttons meet minimum size */
.btn {
  min-height: 44px;
  min-width: 44px;
}

/* For icon-only buttons, add padding */
.btn-icon {
  padding: 12px;
}
```

### 10.4 Screen Reader Support

```html
<!-- Hidden text for screen readers -->
<span class="sr-only">Close dialog</span>

<!-- ARIA labels -->
<button aria-label="Open menu">
  <MenuIcon />
</button>

<!-- Live regions for dynamic content -->
<div aria-live="polite" aria-atomic="true">
  <!-- Toast messages appear here -->
</div>
```

### 10.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. Additional Styling

### 11.1 Custom Scrollbars

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #F5F4F4;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(112, 109, 109, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(112, 109, 109, 0.5);
}
```

### 11.2 Base Body Styles

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #FFFFFF;
  color: #333030;
  font-feature-settings: "rlig" 1, "calt" 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 11.3 Focus Visible Styles

```css
:focus-visible {
  outline: 2px solid #BEDA41;
  outline-offset: 2px;
}
```

### 11.4 Border Default

```css
*, *::before, *::after {
  border-color: #EBE8E8;
}
```

### 11.5 Logo & Branding

The application uses an SVG favicon referenced at `/favicon.svg`. The theme color for mobile browsers is set via the viewport meta:

```tsx
// In layout.tsx
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1E90FF', // Or use #BEDA41 for lime brand
};
```

For logo placement:
- Use SVG format for scalability
- Minimum clear space: 8px around logo
- On lime background: use Charcoal (#333030) logo
- On white background: use Charcoal or full-color logo

---

## 12. CSS Variables Reference

Complete set of CSS custom properties for the design system:

```css
:root {
  /* ===== COLORS ===== */
  
  /* Brand */
  --color-lime: #BEDA41;
  --color-lime-dark: #A8C038;
  --color-lime-light: #D4E86D;
  --color-charcoal: #333030;
  --color-charcoal-dark: #1A1818;
  --color-charcoal-light: #4A4646;
  
  /* Supporting */
  --color-blue: #2868CE;
  --color-blue-dark: #1E52A3;
  --color-red: #BA3737;
  --color-red-dark: #962C2C;
  --color-orange: #D4A337;
  
  /* Feature/Stream Accents */
  --color-stream-pams: #8B5CF6;     /* Purple - People/Teams */
  --color-stream-parts: #10B981;    /* Emerald - Equipment/Assets */
  --color-stream-contracts: #3B82F6; /* Blue - Documents/Procedures */
  
  /* Semantic */
  --color-success: #10B981;
  --color-success-light: #D1FAE5;
  --color-warning: #F59E0B;
  --color-warning-light: #FEF3C7;
  --color-error: #EF4444;
  --color-error-light: #FEE2E2;
  --color-info: #3B82F6;
  --color-info-light: #DBEAFE;
  
  /* Neutrals */
  --color-white: #FFFFFF;
  --color-gray-50: #F9F9F9;
  --color-gray-100: #F5F4F4;
  --color-gray-200: #EBE8E8;
  --color-gray-300: #D9D7D7;
  --color-gray-400: #B5B2B2;
  --color-gray-500: #8A8787;
  --color-gray-600: #706D6D;
  --color-gray-700: #4A4646;
  --color-gray-800: #333030;
  --color-gray-900: #1A1818;
  
  /* ===== BACKGROUNDS ===== */
  --bg-primary: var(--color-white);
  --bg-secondary: var(--color-gray-100);
  --bg-tertiary: var(--color-gray-200);
  --bg-hover: rgba(51, 48, 48, 0.03);
  --bg-active: rgba(51, 48, 48, 0.06);
  --bg-accent: rgba(190, 218, 65, 0.1);
  
  /* ===== TEXT ===== */
  --text-primary: var(--color-charcoal);
  --text-secondary: var(--color-gray-600);
  --text-muted: var(--color-gray-500);
  --text-disabled: rgba(51, 48, 48, 0.4);
  --text-link: var(--color-blue);
  
  /* ===== BORDERS ===== */
  --border-primary: var(--color-gray-200);
  --border-secondary: var(--color-gray-300);
  --border-focus: var(--color-lime);
  
  /* ===== TYPOGRAPHY ===== */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  --text-xs: 0.6875rem;   /* 11px */
  --text-sm: 0.75rem;     /* 12px */
  --text-base: 0.875rem;  /* 14px */
  --text-lg: 1rem;        /* 16px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  
  --font-regular: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  /* ===== SPACING ===== */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  
  /* ===== BORDER RADIUS ===== */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;
  
  /* ===== SHADOWS ===== */
  --shadow-sm: 0 1px 2px rgba(51, 48, 48, 0.05);
  --shadow-md: 0 4px 6px rgba(51, 48, 48, 0.07);
  --shadow-lg: 0 10px 15px rgba(51, 48, 48, 0.1);
  --shadow-xl: 0 20px 25px rgba(51, 48, 48, 0.15);
  
  /* ===== TRANSITIONS ===== */
  --transition-fast: 100ms ease;
  --transition-normal: 150ms ease;
  --transition-slow: 200ms ease;
  --transition-deliberate: 300ms ease;
  
  /* ===== LAYOUT ===== */
  --header-height: 64px;
  --sidebar-collapsed: 56px;
  --sidebar-expanded: 240px;
  
  /* ===== SHADCN/UI HSL TOKENS ===== */
  /* These are used by shadcn/ui components with hsl(var(--token)) */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 209 100% 56%;              /* Maps to brand blue or lime */
  --primary-foreground: 0 0% 100%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 209 100% 56%;
  --radius: 0.5rem;
}
```

### 12.1 HSL Color Reference

The shadcn/ui tokens use HSL format without the `hsl()` wrapper for CSS variable composition:

```css
/* Usage in components */
background-color: hsl(var(--background));
color: hsl(var(--foreground));
border-color: hsl(var(--border));

/* With opacity */
background-color: hsl(var(--primary) / 0.1);
```

| Token | Light Mode HSL | Hex Equivalent |
|-------|----------------|----------------|
| `--background` | `0 0% 100%` | `#FFFFFF` |
| `--foreground` | `222.2 84% 4.9%` | `#030712` |
| `--primary` | `209 100% 56%` | `#1E90FF` |
| `--secondary` | `210 40% 96.1%` | `#F1F5F9` |
| `--muted` | `210 40% 96.1%` | `#F1F5F9` |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `#64748B` |
| `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` |
| `--destructive` | `0 84.2% 60.2%` | `#EF4444` |

---

## 13. Tailwind Configuration

Complete Tailwind configuration to implement this design system:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Plantexpand Brand
        brand: {
          primary: '#BEDA41',    // Lime Green
          hover: '#A8C038',      // Darker Lime
          light: '#D4E86D',      // Light Lime
          dark: '#333030',       // Charcoal
        },
        
        // Semantic
        success: {
          DEFAULT: '#10B981',
          light: '#D1FAE5',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
        },
        
        // shadcn/ui tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## 14. Color Scheme Options

This design system supports two primary color schemes:

### Option A: Lime Green Brand (Plantexpand Official)

| Element | Color |
|---------|-------|
| Primary actions | Lime Green `#BEDA41` |
| Primary text | Charcoal `#333030` |
| Links | Blue `#2868CE` |
| Button text | Charcoal on Lime |

Best for: Official Plantexpand applications, internal tools

### Option B: Dodger Blue Theme

| Element | Color |
|---------|-------|
| Primary actions | Dodger Blue `#1E90FF` |
| Primary text | Dark Gray `#111827` |
| Links | Dodger Blue `#1E90FF` |
| Button text | White on Blue |

Best for: Customer-facing applications, lighter aesthetic

To switch themes, update the `--primary` CSS variable:

```css
/* Lime Green Theme */
:root {
  --primary: 72 73% 55%;  /* HSL for #BEDA41 */
  --ring: 72 73% 55%;
}

/* Dodger Blue Theme */
:root {
  --primary: 209 100% 56%; /* HSL for #1E90FF */
  --ring: 209 100% 56%;
}
```

---

## 15. Implementation Checklist

Use this checklist before submitting UI changes:

### Colors
- [ ] All body text uses Charcoal (`#333030`)
- [ ] All page backgrounds are White (`#FFFFFF`)
- [ ] Primary actions use Lime Green (`#BEDA41`)
- [ ] Links use Blue (`#2868CE`)
- [ ] Errors use Red (`#BA3737`)
- [ ] Warnings use Orange (`#D4A337`)
- [ ] Borders use Platinum (`#EBE8E8`) or Charcoal on hover

### Typography
- [ ] Font family is Inter (or system fallback)
- [ ] Body text is 14px
- [ ] Headings use appropriate size from scale
- [ ] Line heights are comfortable (1.4-1.5)

### Components
- [ ] Buttons have 8px border radius
- [ ] Cards have 12px border radius
- [ ] Inputs have visible focus states
- [ ] All interactive elements are keyboard accessible

### Icons
- [ ] Icons are from Lucide library
- [ ] Icons use strokeWidth 1.5
- [ ] Icon sizes match context (16px inline, 20px nav)
- [ ] Icons inherit appropriate colors

### Spacing
- [ ] All spacing uses 4px base unit multiples
- [ ] Component padding is 12-16px
- [ ] Section gaps are 24px
- [ ] Page margins are 24px (desktop) / 16px (mobile)

### Accessibility
- [ ] Focus states are visible (2px Lime outline)
- [ ] Touch targets are at least 44px
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader text provided where needed

### Animations
- [ ] Transitions use 150ms duration
- [ ] Respects prefers-reduced-motion
- [ ] No jarring or distracting animations

---

## Quick Copy Reference

### Colors

```
Brand:
  Primary (Lime Green): #BEDA41
  Primary Hover:        #A8C038
  Primary Light:        #D4E86D
  
Text:
  Primary (Charcoal):   #333030
  Secondary:            #706D6D
  Muted:                #8A8787
  
Backgrounds:
  Page:                 #FFFFFF
  Surface:              #F5F4F4
  
Borders:
  Default (Platinum):   #EBE8E8
  Stronger:             #D9D7D7
  
Links & Info:
  Link (Blue):          #2868CE
  Info:                 #3B82F6
  
Status:
  Success (Emerald):    #10B981
  Warning (Amber):      #F59E0B
  Error (Red):          #EF4444
  Error Alt:            #BA3737
  
Feature/Stream Accents:
  PAMS (Purple):        #8B5CF6
  Parts (Emerald):      #10B981
  Contracts (Blue):     #3B82F6
```

### Measurements

```
Border Radius:
  Buttons/Inputs:  8px
  Cards/Modals:    12px
  Badges:          4px
  Pills:           9999px

Font Sizes:
  Caption:         11px
  Small:           12px
  Body:            14px
  Card Title:      16px
  Heading:         20px
  Page Title:      24px

Font Weights:
  Regular:         400
  Medium:          500
  Semibold:        600
  Bold:            700

Spacing:
  Tight:           4px
  Small:           8px
  Component gap:   12px
  Card padding:    16px
  Section gap:     24px
  Page margin:     24px (desktop) / 16px (mobile)

Layout:
  Header height:   64px
  Sidebar collapsed: 56px
  Sidebar expanded:  240px
  Modal max-width:   512px (sm:max-w-lg)
  
Transitions:
  Fast:            100ms ease
  Normal:          150ms ease
  Slow:            200ms ease
  Deliberate:      300ms ease
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | December 2024 | PlantEx IT | Initial portable style guide |
| 1.1 | December 2024 | PlantEx IT | Added: Stream accent colors, Toast notifications, File upload zones, Loading states, Selection cards, AI suggestion cards, Form labels, Radio groups, Scrollbar styling, Tailwind configuration, Color scheme options, cn() utility function, exact package versions |

---

## Getting Started (For New Projects)

1. **Install dependencies** from package.json (Section 2)
2. **Copy the Tailwind config** (Section 13)
3. **Copy the CSS variables** to your globals.css (Section 12)
4. **Install Inter font** via Google Fonts or next/font
5. **Install Lucide icons**: `npm install lucide-react`
6. **Install shadcn/ui components** as needed: `npx shadcn-ui@latest add button dialog input`
7. **Copy the cn() utility** (Section 2) for class merging

---

*This document is the source of truth for Plantexpand UI design. All applications should adhere to these standards for visual consistency.*

