---
name: brand-guidelines
description: Applies Resolute Healthcare BPO's official brand colors and typography to any sort of artifact that may benefit from having Resolute's look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply.
license: Complete terms in LICENSE.txt
---

# Resolute Healthcare BPO Brand Styling

## Overview

To access Resolute Healthcare BPO's official brand identity and style resources, use this skill.

**Keywords**: branding, corporate identity, visual identity, post-processing, styling, brand colors, typography, Resolute brand, visual formatting, visual design, healthcare BPO

## Brand Guidelines

### Colors

**Primary Colors:**

- Navy: `#363F4D` - Primary text, dark backgrounds, headings
- Teal: `#2DD1AC` - Primary accent, buttons, highlights, links
- White: `#FFFFFF` - Light backgrounds, text on dark

**Secondary Colors:**

- Light Background: `#F9FAFB` - Subtle section backgrounds
- Light Text: `#5F6B7A` - Secondary/body text
- Hover Teal: `#24b896` - Button hover states

**Gradient:**

- Hero/Feature gradient: `linear-gradient(135deg, #363F4D, #2DD1AC)`

**Semantic Colors:**

- Available/Success: `#2DD1AC` (teal)
- Taken/Error: `#F44336`
- Reserved/Warning: `#FF9800`

### Typography

- **Headings**: Graphik (with Arial fallback), weight 700-800, uppercase for H1
- **Body Text**: Roboto (with Georgia fallback), weight 300-600
- **Accents**: Raleway (with Arial fallback)
- **Note**: Fonts should be pre-installed in your environment for best results

### Font Sizes

- H1: `clamp(32px, 6vw, 76px)` - uppercase, letter-spacing -1px
- H2: `clamp(36px, 4vw, 56px)`
- H3: 24px
- Body: 16px standard, `clamp(18px, 2vw, 24px)` for hero

## Features

### Smart Font Application

- Applies Graphik font to headings (24pt and larger)
- Applies Roboto font to body text
- Automatically falls back to Arial/Georgia if custom fonts unavailable
- Preserves readability across all systems

### Text Styling

- Headings (24pt+): Graphik font, weight 700-800
- Body text: Roboto font, weight 300-600
- Smart color selection based on background
- Preserves text hierarchy and formatting

### Button Styles

- Background: `#2DD1AC` (teal)
- Color: `#FFFFFF`
- Padding: 14px 32px
- Border-radius: 4px
- Font: Graphik, 600 weight, 16px, uppercase
- Hover: `#24b896`, translateY(-1px)
- Outline variant: transparent bg, white or navy border

### Shape and Accent Colors

- Non-text shapes use teal accent `#2DD1AC`
- Glassmorphism elements with backdrop blur
- Soft rounded corners (20-24px border-radius)
- Subtle animations (float, shimmer effects)

### Card Styling

- Background: white
- Padding: 40px
- Border-radius: 24px
- Border: 2px transparent (teal on hover)
- Box-shadow: `0 4px 20px rgba(0, 0, 0, 0.05)`
- Hover: lift -8px, enhanced shadow

## Technical Details

### Font Management

- Uses system-installed Graphik, Roboto, and Raleway fonts when available
- Provides automatic fallback to Arial (headings) and Georgia (body)
- No font installation required - works with existing system fonts
- For best results, pre-install Graphik, Roboto, and Raleway fonts

### Color Application

- Uses RGB color values for precise brand matching
- Navy (#363F4D) for dark backgrounds and primary text
- Teal (#2DD1AC) for all interactive/accent elements
- Maintains color fidelity across different systems

### Design Personality

- "BPO Solutions That Feel Human"
- Compassionate, professional, modern, healthcare-focused
- Clean minimal flat design with gradient overlays
- Card-based layouts with hover lift effects
