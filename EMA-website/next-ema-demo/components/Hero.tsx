import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const Hero = () => {
  const imageRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Parallax effect for hero image on mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!imageRef.current) return;
      
      const { clientX, clientY } = e;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Calculate mouse position relative to the center of the window
      const mouseX = (clientX / windowWidth - 0.5) * -10; // -5 to 5 degrees
      const mouseY = (clientY / windowHeight - 0.5) * 10; // -5 to 5 degrees
      
      // Apply the 3D transform rotation
      imageRef.current.style.transform = 
        `perspective(1000px) rotateY(${mouseX}deg) rotateX(${mouseY}deg) translateZ(10px)`;
    };

    // Add mousemove event listener
    window.addEventListener('mousemove', handleMouseMove);
    
    // Set visible after a short delay for entrance animation
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    
    // Clean up
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timer);
    };
  }, []);

  return (
    <section className="relative overflow-hidden py-12 lg:py-20 px-6">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-primary-50/30 to-white opacity-70"></div>
      
      {/* Content */}
      <div className={`max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center relative transition-all duration-1000 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}>
        <div className="max-w-2xl mx-auto lg:mx-0 transition-all duration-1000 delay-300">
          <span className={`text-sm font-medium text-primary-600 mb-4 block transition-all duration-700 delay-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}>
            Introducing
          </span>
          
          <h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 transition-all duration-700 delay-500 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600">
              A smarter way to manage your email
            </span>
          </h1>
          
          <p className={`text-xl text-gray-600 mb-10 leading-relaxed transition-all duration-700 delay-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}>
            EMA uses artificial intelligence to summarize emails, extract calendar events, and help you respond faster—all right within your inbox.
          </p>
          
          <div className={`flex flex-wrap gap-4 transition-all duration-700 delay-900 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}>
            <Link 
              href="#" 
              className="px-7 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-full transition-all transform hover:-translate-y-1 hover:shadow-lg"
            >
              Add to Chrome
            </Link>
            <Link 
              href="#features" 
              className="px-7 py-3 flex items-center text-primary-600 font-medium hover:text-primary-700 transition-colors group"
            >
              Learn more 
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1 transform transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
        
        <div className={`flex justify-center lg:justify-end transition-all duration-1000 delay-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}>
          <div 
            ref={imageRef} 
            className="relative w-full max-w-xl transition-transform duration-300 ease-out"
          >
            {/* Animated gradient background */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary-100 to-transparent opacity-30 blur-3xl rounded-3xl animate-pulse-slow"></div>
            
            {/* Floating elements decoration */}
            <div className="absolute -left-8 -top-8 w-16 h-16 bg-primary-100 rounded-full opacity-40 animate-float"></div>
            <div className="absolute -right-4 top-1/4 w-12 h-12 bg-primary-200 rounded-full opacity-30 animate-float" style={{ animationDelay: '1s' }}></div>
            <div className="absolute left-1/4 -bottom-8 w-14 h-14 bg-primary-100 rounded-full opacity-30 animate-float" style={{ animationDelay: '2s' }}></div>
            
            {/* The image with shadow and hover effect */}
            <div className="relative rounded-2xl overflow-hidden shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary-600/10 to-primary-50/30"></div>
              <Image 
                src="/images/hero-image.png" 
                alt="EMA in action"
                width={700} 
                height={500}
                className="w-full h-auto"
                priority
              />
              
              {/* Overlay reflection effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 left-0 w-64 h-64 bg-primary-50 rounded-full filter blur-3xl opacity-30 animate-pulse-slow"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-50 rounded-full filter blur-3xl opacity-20 animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
    </section>
  );
};

export default Hero; 