# EMA - Enhanced Mail Assistant Website

A modern, responsive landing page for the EMA (Enhanced Mail Assistant) Chrome extension built with Next.js, TypeScript, and Tailwind CSS.

## Features

- 🚀 **Next.js**: Fast, SEO-friendly React framework with server-side rendering
- 🎨 **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- 📱 **Responsive Design**: Optimized for all screen sizes
- 🔍 **SEO Optimized**: Built-in SEO component for better search engine rankings
- 🌓 **Dark Mode Support**: Toggle between light and dark themes
- 🎭 **Animation Effects**: Smooth animations for enhanced user experience
- 🧩 **Component-Based Architecture**: Reusable UI components for consistency
- 📊 **Modern UI**: Clean, apple-inspired design system

## Recent Improvements

- Enhanced Tailwind configuration with extended color palette and utilities
- Created reusable UI components (Button, Container, Header, etc.)
- Added animations and hover effects to improve user experience
- Implemented dark mode support with theme context
- Optimized layout and responsiveness for all devices
- Added SEO component for better search engine visibility
- Improved code organization and maintainability
- Enhanced typography and spacing for better readability

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ema-website.git
   cd ema-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Visit [http://localhost:3000](http://localhost:3000) to see the website in action.

## Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
next-ema-demo/
├── app/                  # Next.js app directory
│   ├── page.tsx          # Home page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/           # Reusable UI components
│   ├── ui/               # Basic UI components
│   │   ├── Button.tsx    # Button component
│   │   └── Container.tsx # Container component  
│   ├── Header.tsx        # Site header
│   ├── Hero.tsx          # Hero section
│   ├── Features.tsx      # Features section
│   ├── FeatureCard.tsx   # Feature card component
│   └── SEO.tsx           # SEO component
├── contexts/             # React contexts
│   └── ThemeContext.tsx  # Theme context for dark mode
├── public/               # Static files
│   └── images/           # Image assets
├── next.config.js        # Next.js configuration
├── tailwind.config.js    # Tailwind CSS configuration
├── postcss.config.js     # PostCSS configuration
└── tsconfig.json         # TypeScript configuration
```

## Customization

- Update the colors in `tailwind.config.js` to match your brand
- Replace images in the `/public/images` directory
- Modify content in the components as needed

## License

This project is licensed under the MIT License. 