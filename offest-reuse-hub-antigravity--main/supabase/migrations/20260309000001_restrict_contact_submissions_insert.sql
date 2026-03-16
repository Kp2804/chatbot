-- Restrict contact form inserts to authenticated users only,
-- preventing anonymous bots from spamming the submissions table.
DROP POLICY IF EXISTS "Users can submit contact forms" ON contact_submissions;

CREATE POLICY "Authenticated users can submit contact forms"
  ON contact_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
