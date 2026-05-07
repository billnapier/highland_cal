import { createClient } from '@/lib/supabase/server'

export default async function DbHealthPage() {
  const supabase = await createClient()

  // Attempt to query the database.
  // Since we haven't authenticated, this tests the connection 
  // and the public RLS policy on the Games table.
  const { data, error } = await supabase.from('Games').select('id').limit(1)

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Database Health Check</h1>
      {error ? (
        <div className="p-4 bg-red-100 text-red-800 rounded-md">
          <h2 className="font-semibold">Connection Error</h2>
          <pre className="mt-2 text-sm whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
        </div>
      ) : (
        <div className="p-4 bg-green-100 text-green-800 rounded-md">
          <h2 className="font-semibold">Connection Successful</h2>
          <p className="mt-2 text-sm">Successfully connected to Supabase and queried the Games table.</p>
          <pre className="mt-2 text-sm whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
