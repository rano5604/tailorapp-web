// app/layout.tsx
import './globals.css';
// Pick ONE of these, matching your version:
import 'react-day-picker/style.css';        // v9/10+
/* or */ // import 'react-day-picker/dist/style.css'; // v8

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
        <body>{children}</body>
        </html>
    );
}
