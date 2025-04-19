import { FC, useState } from 'react';
import FeatureCard from './FeatureCard';
import { useInView } from 'react-intersection-observer';

// Feature data
const features = [
  {
    id: 1,
    title: 'Smart Summaries',
    description: 'Get concise, AI-generated summaries of your emails at a glance, so you can quickly understand what matters.',
    iconSrc: '/images/summary-icon.svg'
  },
  {
    id: 2,
    title: 'Calendar Integration',
    description: 'EMA automatically detects dates, times, and events in your emails and lets you add them to your calendar with a single click.',
    iconSrc: '/images/calendar-icon.svg'
  },
  {
    id: 3,
    title: 'AI Chat Assistant',
    description: 'Ask questions about your emails and get instant answers. No more searching through endless threads to find what you need.',
    iconSrc: '/images/chat-icon.svg'
  },
  {
    id: 4,
    title: 'Smart Replies',
    description: 'Let EMA draft context-aware responses or compose new emails for you based on your communication style.',
    iconSrc: '/images/reply-icon.svg'
  }
];

const Features: FC = () => {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <section id="features" className="relative py-24 md:py-32 px-6 overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50/80 to-white"></div>
      <div className="absolute -right-64 top-1/4 w-96 h-96 bg-primary-50 rounded-full filter blur-3xl opacity-30"></div>
      <div className="absolute -left-64 bottom-1/4 w-96 h-96 bg-primary-50 rounded-full filter blur-3xl opacity-30"></div>
      
      {/* Content */}
      <div className="max-w-7xl mx-auto relative">
        <div 
          ref={ref}
          className={`text-center mb-16 md:mb-28 transition-all duration-1000 ${
            inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-primary-600 mb-3 block">
            Features
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 max-w-4xl mx-auto mb-6">
            Everything you need to master your inbox
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            EMA helps you focus on what matters, automating routine tasks and providing intelligent assistance when you need it.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {features.map((feature, index) => (
            <div 
              key={feature.id}
              onMouseEnter={() => setHoveredFeature(feature.id)}
              onMouseLeave={() => setHoveredFeature(null)}
              className="relative z-10"
            >
              <FeatureCard
                title={feature.title}
                description={feature.description}
                iconSrc={feature.iconSrc}
                delay={index}
              />
              
              {/* Highlight effect when hovering */}
              {hoveredFeature === feature.id && (
                <div className="absolute -inset-4 bg-primary-50/50 rounded-3xl -z-10 blur-xl"></div>
              )}
            </div>
          ))}
        </div>
        
        {/* Additional feature highlight section */}
        <div className={`mt-32 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center transition-all duration-1000 delay-500 ${
          inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <div className="rounded-2xl overflow-hidden shadow-lg bg-white border border-gray-100 p-2">
            <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
              {/* Feature showcase image/screenshot */}
              <div className="absolute inset-0 bg-gradient-to-tr from-primary-600/20 to-transparent"></div>
              <div className="relative w-full h-full flex items-center justify-center text-white text-lg">
                Feature showcase image
              </div>
            </div>
          </div>
          
          <div className="max-w-lg">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary-600 mb-3 block">
              Seamless Integration
            </span>
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
              Works right in your existing email workflow
            </h3>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              EMA integrates directly with Gmail and Outlook, requiring zero setup or configuration. It runs in the background, ready to assist whenever you need it.
            </p>
            
            <ul className="space-y-4">
              {['No account setup required', 'Works with Gmail & Outlook', 'Minimal learning curve'].map((point, i) => (
                <li key={i} className="flex items-start">
                  <span className="mr-3 text-primary-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-gray-700">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features; 