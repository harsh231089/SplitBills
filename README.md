# Tabby

Tabby is a static application backed by Supabase. Sign up with an email and password to access your groups across devices. Confirm your email before signing in.

Create groups, add members and expenses, and record payments. Expenses are split equally among the selected members; remaining cents are distributed in member order. Payments are records only and do not transfer money.

Expenses and payments remain in the group's history until deleted.

Groups, expenses and payments are stored in Supabase. In **Manage group**, the group owner can grant access to an email address. That person must create an account with the same email address; the app does not send an invitation email. Members can edit expenses and participants, while only the owner can manage access or delete the group.

Existing browser data remains in its original local storage. Use **Import local groups** from the same browser and site address where the data was saved to copy it to your account. Importing again creates duplicates. Cloud edits that fail to save remain in the open page; export the draft before refreshing or signing out. Refresh the app to see changes made by other members. If two people edit the same group at once, the later save is rejected rather than overwriting the first.

The app loads the Supabase JavaScript client from jsDelivr and fonts from Google Fonts. Run it from a web server when developing locally. The database schema and row-level access policies are in `supabase.sql`. The browser uses a publishable key only; never put a Supabase secret or database password in the app. Configure the Supabase authentication site URL and redirect allowlist for the deployed site before using email confirmations. Supabase's default email service only sends to project team members; configure custom SMTP before inviting other users.