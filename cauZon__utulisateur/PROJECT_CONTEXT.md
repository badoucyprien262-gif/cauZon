# 📚 cauZon - Context & Technical Specifications (Frontend Dev)

## 🎯 Project Overview
cauZon is a Universal Academic Hub for West African students and learners. 
It allows users to search, preview, unlock, and consult certified academic documents (courses, exams, exercises) offline without internet.

## 🏗️ Architecture & Dual-App Model
1. **User App (Mobile - React Native Expo):** Client-side execution app. Search, 3-page preview, offline library, Mobile Money unlocking, and VIP Pass.
2. **Admin App (Web - React.js Vite):** Restricted back-office dashboard for document publishing, 3-level indexing, and push notification triggers.

## 🎨 UI/UX Theme & Visual Guidelines
- **Primary Color:** Deep Emerald Green (`#0C1E1B`)
- **Accent Color:** Gold / Cream (`#D4AF37`)
- **Background Light:** `#F4F7F6`
- **Dark Mode:** Native support
- **Design Style:** Clean, highly scannable, rounded cards, no author avatars.

## 🛠️ Official Frontend Stack
- **Framework:** React Native (Expo) + TypeScript
- **Styling:** NativeWind / Tailwind CSS or StyleSheets with CSS variables
- **Navigation:** React Navigation (Bottom Tabs)
- **Offline Storage:** Expo FileSystem + SQLite
- **PDF Reader:** `react-native-pdf`
- **Device Security:** `expo-application` (Device_ID fingerprinting for fraud prevention)
- **Backend Service:** Supabase (PostgreSQL + RLS + Edge Functions)

## 🔑 Key Features to Build in Frontend
1. **Home Screen:** Pill-shaped search bar, horizontal category filter, 2-column document grid, certified badges, emergency exam banner.
2. **Library Screen:** In-app cloud gauge (250 MB free quota), automatic thematic folders (based on keywords), offline indicator, double action buttons (In-app Read / External Export).
3. **Acquisition & Security Flow:**
   - Free 3-page preview in PDF reader.
   - 1st free full document (locked by Phone Number + Device_ID).
   - Single purchase modal (100 FCFA) or VIP Pass (500 FCFA/month).