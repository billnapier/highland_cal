import { createClient } from '@/lib/supabase/server'

export default async function DbHealthPage() {
  const supabase = await createClient()

  // Attempt to query the database.
  // Since we haven't authenticated, this tests the connection 
  // and the public RLS policy on the Games table.
  const { data, error } = await supabase.from('games').select('id').limit(1)

  return (
    <main className="flex flex-1 flex-col p-8 bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/80 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/30 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">Database Health Check</h1>
          <p className="text-muted-foreground mt-2">Verify the Supabase connection and public RLS policies.</p>
        </div>
        
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground shadow-xl p-6">
          {error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-red-500"></span>
                Connection Error
              </h2>
              <pre className="mt-4 text-sm whitespace-pre-wrap bg-white/50 dark:bg-black/50 p-4 rounded-lg overflow-x-auto">{JSON.stringify(error, null, 2)}</pre>
            </div>
          ) : (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500"></span>
                Connection Successful
              </h2>
              <p className="mt-2 text-sm opacity-80">Successfully connected to Supabase and queried the Games table.</p>
              <pre className="mt-4 text-sm whitespace-pre-wrap bg-white/50 dark:bg-black/50 p-4 rounded-lg overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
