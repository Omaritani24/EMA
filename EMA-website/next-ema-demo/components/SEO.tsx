import React from 'react';
import Head from 'next/head';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
}

const SEO: React.FC<SEOProps> = ({
  title = 'EMA - Enhanced Mail Assistant',
  description = 'EMA uses artificial intelligence to summarize emails, extract calendar events, and help you respond faster—all right within your inbox.',
  canonical = 'https://enhanced-mail-assistant.com',
  ogType = 'website',
  ogImage = '/images/ema-social-card.png',
}) => {
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" href="/favicon.ico" />
      <link rel="canonical" href={canonical} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      
      {/* Additional tags */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="theme-color" content="#0071e3" />
    </Head>
  );
}

export default SEO; 