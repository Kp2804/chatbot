-- Create contact_submissions table to store contact form submissions
CREATE TABLE IF NOT EXISTS contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company TEXT,
    description TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved'))
);

-- Enable RLS
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own submissions
CREATE POLICY "Users can submit contact forms"
    ON contact_submissions
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

-- Policy: Users can view their own submissions
CREATE POLICY "Users can view own submissions"
    ON contact_submissions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
    ON contact_submissions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Create index for faster queries
CREATE INDEX idx_contact_submissions_user_id ON contact_submissions(user_id);
CREATE INDEX idx_contact_submissions_created_at ON contact_submissions(created_at DESC);
CREATE INDEX idx_contact_submissions_status ON contact_submissions(status);
