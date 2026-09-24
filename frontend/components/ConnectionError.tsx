interface ConnectionErrorProps {
  message: string;
  onRetry?: () => void;
}

export default function ConnectionError({ message, onRetry }: ConnectionErrorProps) {

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6 text-center">
        <div className="bg-gray-800 border border-red-500/30 rounded-xl p-8 max-w-md shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            ⚠️
          </div>
          <h1 className="text-2xl font-bold text-red-400 mb-2">
            Server Unreachable
          </h1>
          <p className="text-gray-300 text-sm mb-6">
            {message ||
              "The game server failed to respond. Please try again later."}
          </p>
          <button
            onClick={onRetry}
            className="w-full py-3 bg-red-600 hover:bg-red-500 transition text-white font-semibold rounded-lg shadow-lg"
          >
            Retry Connection
          </button>
        </div>
      </div>
  );
}