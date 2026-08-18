import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
	import.meta.env.PUBLIC_SUPABASE_URL ||
	'https://yotkdsnmcgpcwdygtpyi.supabase.co';

const supabaseAnonKey =
	import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdGtkc25tY2dwY3dkeWd0cHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTQ3OTYsImV4cCI6MjEwMTc3MDc5Nn0.WxRgm7yB-UxNe_kkaf4lk7_etS_9L8FXxLK0EAnS0LM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
