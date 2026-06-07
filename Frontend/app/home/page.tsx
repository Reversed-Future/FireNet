'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '../components/Navbar'
import FireNetSections from '../components/home/FireNetSections'

const homeDemoImages = [
  '/home-demo1.png',
  '/home-demo2.png',
  '/home-demo3.png',
  '/home-demo4.png'
]

export default function HomePage() {
  const router = useRouter()
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % homeDemoImages.length)
    }, 3500)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background grid */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div style={{
          backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Animated gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Navigation */}
      <Navbar />

      {/* Main Content */}
      <div className="relative z-10 pt-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            {/* Left Content */}
            <div className="space-y-8">
              {/* Main Heading */}
              <div className="space-y-4 pt-32">
                <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
                  Global Wildfire
                  <br />
                  <span className="bg-gradient-to-r from-orange-500 via-red-500 to-red-600 bg-clip-text text-transparent">
                    Information Platform
                  </span>
                </h1>
              </div>

              {/* Subtitle */}
              <p className="text-xl text-slate-300 leading-relaxed max-w-lg">
                A comprehensive solution for real-time detection and visualization of global fire incidents within 48 hours. Monitor hotspots worldwide with advanced GIS analytics and automated early warning systems.
              </p>

              {/* Key Features */}
              <div className="space-y-4 pt-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Real-Time Global Detection</h3>
                    <p className="text-slate-400 text-sm">Monitor 48-hour fire data across the entire globe with instant updates</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">3D Globe Visualization</h3>
                    <p className="text-slate-400 text-sm">Interactive Mapbox WebGL rendering for intuitive spatial analysis</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Automated Risk Assessment</h3>
                    <p className="text-slate-400 text-sm">Smart fire level classification (HIGH/MEDIUM/LOW) with predictive analytics</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Low-Latency Alert System</h3>
                    <p className="text-slate-400 text-sm">Real-time WebSocket push notifications for emergency response</p>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <button
                  onClick={() => router.push('/map')}
                  className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-orange-500/50"
                >
                  Enter Platform →
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-800">
                <div>
                  <div className="text-2xl font-bold text-orange-500">200+</div>
                  <div className="text-sm text-slate-400">Countries Monitored</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-500">24h</div>
                  <div className="text-sm text-slate-400">Real-Time Data</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-500">&lt;1s</div>
                  <div className="text-sm text-slate-400">Alert Latency</div>
                </div>
              </div>
            </div>

            {/* Right Side - Visual Demo */}
            <div className="relative hidden md:block md:mt-[340px] lg:mt-[320px]">
              <div className="relative">
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl transform hover:scale-105 transition-transform duration-300">
                  <img
                    src={homeDemoImages[activeImageIndex]}
                    alt={`Global Fire Detection Platform Demo ${activeImageIndex + 1}`}
                    className="w-full h-auto transition-opacity duration-700"
                  />
                </div>

                {/* Floating elements */}
                <div className="absolute -top-6 -right-6 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl" />
                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-red-500/10 rounded-full blur-2xl" />
              </div>
            </div>
          </div>


          <FireNetSections />
        </div>
      </div>

      <footer className="relative z-10 border-t border-slate-800/50 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center">
          <p className="text-slate-400 text-sm">© 2026 FireNet. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
