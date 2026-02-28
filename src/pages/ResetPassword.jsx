import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { authAPI } from '../services/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Reset token is missing. Use the reset link from your email.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError('Please complete all required fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.resetPassword({
        token,
        new_password: newPassword
      });
      setSuccess(response?.data?.message || 'Password reset successful.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Could not reset password. Please request a new reset link.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-white">Set New Password</h1>
        <p className="text-blue-200/80 text-sm mt-2">
          Choose a strong password with uppercase, lowercase, number, and special character.
        </p>

        {error && (
          <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-100 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 bg-green-500/20 border border-green-500/50 text-green-100 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-sm text-blue-100/80 block mb-2">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full pl-4 pr-20 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Enter new password"
                disabled={loading}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-blue-300/60 hover:text-blue-300"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                <Lock className="w-5 h-5 text-blue-300/50" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-blue-100/80 block mb-2">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full pl-4 pr-20 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Confirm new password"
                disabled={loading}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="text-blue-300/60 hover:text-blue-300"
                  disabled={loading}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                <Lock className="w-5 h-5 text-blue-300/50" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {loading ? 'Resetting password...' : 'Reset password'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link to="/login" className="text-blue-300 hover:text-blue-200 text-sm">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
