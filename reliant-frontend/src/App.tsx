import { Routes, Route, useLocation } from 'react-router-dom'
import Home from "./pages/Home"
import Customers from "./pages/customers"
import MakeQuote from "./pages/quotes"
import Quotations from "./pages/Quotations"

import  RolePicker from './components/Topbar'
import Sidebar from "./components/Sidebar"


export default function App(){
  const location = useLocation()
  const title = location.pathname === '/' 
    ? 'Home' 
    : location.pathname.replace('/','').replace('-',' ').replace('-',' ')

  return (
    <div className="min-h-dvh flex">
      <Sidebar />
      <section className="flex-1 flex flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0b1230]/70 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/30 ring-1 ring-blue-400/30" />
            <strong className="text-lg">{title}</strong>
          </div>
          <RolePicker />
        </header>
        <main className="p-4 grid gap-4">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/make-quote" element={<MakeQuote />} />
            <Route path="/quotations" element={<Quotations />} />
          </Routes>
        </main>
      </section>
    </div>
  )
}
