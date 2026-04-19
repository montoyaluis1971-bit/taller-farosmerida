const SUPABASE_URL = 'https://zsftubjexoogvmdhjleb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZnR1YmpleG9vZ3ZtZGhqbGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODU0ODksImV4cCI6MjA4ODY2MTQ4OX0.2tEeJtkb3WZh8SY2FCgUihbEQEx-P7_RDp2wzk1-dSM';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit'   // tokens llegan en #hash, no en ?code= (PKCE)
  }
});
