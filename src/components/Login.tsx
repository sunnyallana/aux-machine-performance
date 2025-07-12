import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Factory, User, Lock, AlertCircle } from 'lucide-react';
import apiService from '../services/api';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoInitialized, setDemoInitialized] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const initializeDemo = async () => {
    try {
      await apiService.initDemo();
      setDemoInitialized(true);
      setError('');
    } catch (err) {
      setError('Failed to initialize demo accounts');
    }
  };

  const fillDemoCredentials = (role: 'admin' | 'operator') => {
    setUsername(role);
    setPassword(`${role}123`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Factory className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            Industrial IoT Monitor
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Sign in to access your production dashboard
          </p>
        </div>

        <div className="bg-gray-800 py-8 px-6 shadow-xl rounded-lg border border-gray-700">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-center text-sm text-gray-400 mb-4">
              Demo Environment
            </p>
            
            {!demoInitialized && (
              <button
                onClick={initializeDemo}
                className="w-full mb-3 py-2 px-4 border border-gray-600 rounded-md text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Initialize Demo Accounts
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => fillDemoCredentials('admin')}
                className="py-2 px-4 border border-green-600 rounded-md text-sm text-green-400 hover:bg-green-900/20 transition-colors"
              >
                Admin Demo
              </button>
              <button
                onClick={() => fillDemoCredentials('operator')}
                className="py-2 px-4 border border-blue-600 rounded-md text-sm text-blue-400 hover:bg-blue-900/20 transition-colors"
              >
                Operator Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;