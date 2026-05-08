import LoginButton from '@/components/LoginButton';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            Highland Cal
          </h1>
          <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
            Coming Soon. The schedule of Highland Games and practices.
          </p>
        </div>
        <LoginButton />
      </div>
    </main>
  );
}
