import { FC } from 'react';
import Image from 'next/image';
import { useInView } from 'react-intersection-observer';

interface FeatureCardProps {
  title: string;
  description: string;
  iconSrc: string;
  delay?: number;
}

const FeatureCard: FC<FeatureCardProps> = ({ 
  title, 
  description, 
  iconSrc,
  delay = 0 
}) => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <div 
      ref={ref}
      className={`
        group bg-white p-8 md:p-10 rounded-2xl shadow-sm border border-gray-100
        hover:shadow-md hover:border-primary-100 transition-all duration-500
        transform hover:-translate-y-2
        ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
      `}
      style={{ 
        transitionDelay: `${delay * 150}ms`,
        transitionProperty: 'all',
        transitionDuration: '800ms',
        transitionTimingFunction: 'cubic-bezier(0.5, 0, 0, 1)'
      }}
    >
      <div className="relative mb-8">
        {/* Animation indicator dot */}
        <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-primary-300 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
        
        {/* Icon background with hover effect */}
        <div className="bg-gray-50 group-hover:bg-primary-50 w-16 h-16 flex items-center justify-center rounded-xl mb-1 transition-colors duration-300">
          <div className="relative w-8 h-8">
            <Image 
              src={iconSrc} 
              alt={`${title} icon`}
              fill
              className="text-primary-600 group-hover:scale-110 transition-transform duration-300"
            />
          </div>
        </div>
      </div>
      
      <h3 className="text-xl md:text-2xl font-semibold mb-4 text-gray-800 group-hover:text-gray-900 transition-colors duration-300">
        {title}
      </h3>
      
      <p className="text-base md:text-lg text-gray-600 leading-relaxed group-hover:text-gray-700 transition-colors duration-300">
        {description}
      </p>
      
      {/* Arrow indicator that appears on hover */}
      <div className="mt-6 text-primary-600 opacity-0 transform translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
};

export default FeatureCard; 