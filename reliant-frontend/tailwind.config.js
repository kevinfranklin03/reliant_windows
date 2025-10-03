import { Config } from 'tailwindcss'
export default {
content: [
'./index.html',
'./src/**/*.{ts,tsx}',
],
theme: {
extend: {
colors: {
reliant: {
bg: '#0b1020',
panel: '#101733',
ring: '#2b3a7d',
text: '#e8eeff',
muted: '#98a6d6',
accent: '#6ea8ff',
ok: '#2ecc71',
warn: '#f1c40f',
err: '#e74c3c'
}
},
boxShadow: {
soft: '0 10px 30px rgba(0,0,0,0.25)'
}
}
},
plugins: []
}