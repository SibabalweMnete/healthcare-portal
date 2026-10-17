-- Enable UUID extension for secure primary keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables if re-running script (Development only)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS medical_documents CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS appointment_status;

-- Create Enums
CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled');

-- 1. Users Table (Patients, Doctors, Admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'patient',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Doctors Profile Table
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    specialization VARCHAR(100) NOT NULL,
    location VARCHAR(150) NOT NULL,
    fee NUMERIC(10, 2) NOT NULL,
    experience_years INT NOT NULL,
    languages TEXT[] NOT NULL,
    bio TEXT
);

-- 3. Appointments Table (With ACID unique slot constraint to prevent double-booking)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
    slot_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status appointment_status DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doctor_slot UNIQUE (doctor_id, slot_time)
);

-- 4. Medical Documents Table
CREATE TABLE medical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    ai_summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);