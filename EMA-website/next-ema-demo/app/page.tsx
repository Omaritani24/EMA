import React from 'react';
import Hero from '../components/Hero';
import Features from '../components/Features';
import Header from '../components/Header';

export default function Home() {
  return (
    <main className="bg-white">
      <Header />
      <Hero />
      <Features />
      
      {/* Additional content would go here: How it works, Testimonials, Pricing, etc. */}
      
      {/* Call to action section with improved design */}
      <section className="bg-gradient-to-b from-white to-gray-50/50 py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            Ready to transform your email experience?
          </h2>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            Join thousands of users who save time and boost productivity with EMA.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a 
              href="#" 
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-full transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              Get EMA for Chrome
            </a>
            <a 
              href="#" 
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-full transition-all hover:-translate-y-1"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>
      
      {/* Improved footer with better layout and design */}
      <footer className="bg-gray-50 pt-20 pb-10 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-16">
            <div className="col-span-2">
              <div className="flex items-center mb-5">
                <img src="/images/ema-logo.svg" alt="EMA Logo" className="h-8 w-auto mr-3" />
                <span className="font-semibold text-xl text-gray-900">EMA</span>
              </div>
              <p className="text-gray-600 mb-8 max-w-xs leading-relaxed">
                Enhanced Mail Assistant - Your AI-powered email companion for a more productive inbox.
              </p>
              <div className="flex space-x-5">
                <a href="#" className="text-gray-400 hover:text-primary-600 transition-colors">
                  <span className="sr-only">Twitter</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-primary-600 transition-colors">
                  <span className="sr-only">LinkedIn</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-5">
                Product
              </h3>
              <ul className="space-y-4">
                <li><a href="#features" className="text-gray-600 hover:text-primary-600 transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-gray-600 hover:text-primary-600 transition-colors">Pricing</a></li>
                <li><a href="#" className="text-gray-600 hover:text-primary-600 transition-colors">Roadmap</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-5">
                Resources
              </h3>
              <ul className="space-y-4">
                <li><a href="#" className="text-gray-600 hover:text-primary-600 transition-colors">Guide</a></li>
                <li><a href="#faq" className="text-gray-600 hover:text-primary-600 transition-colors">FAQ</a></li>
                <li><a href="#" className="text-gray-600 hover:text-primary-600 transition-colors">Support</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-5">
                Company
              </h3>
              <ul className="space-y-4">
                <li><a href="#" className="text-gray-600 hover:text-primary-600 transition-colors">About</a></li>
                <li><a href="#" className="text-gray-600 hover:text-primary-600 transition-colors">Contact</a></li>
                <li><a href="#" className="text-gray-600 hover:text-primary-600 transition-colors">Legal</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 mt-8 border-t border-gray-200 flex flex-col md:flex-row md:justify-between text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} EMA - Enhanced Mail Assistant. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-primary-600 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary-600 transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
} 