import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  User,
  Mail,
  Phone,
  MapPin,
  ArrowLeft,
  Save,
  Edit2,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

export function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    location: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          setFormData({
            full_name: session.user.user_metadata?.full_name || "",
            phone: session.user.user_metadata?.phone || "",
            location: session.user.user_metadata?.location || "",
          });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };
    checkUser();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: formData.full_name,
          phone: formData.phone,
          location: formData.location,
        },
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setIsEditing(false);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) setUser(session.user);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match!' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters!' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Password updated successfully!' });
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setIsChangingPassword(false);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0f0f13]">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="w-10 h-10 flex items-center justify-center text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-black dark:text-white uppercase tracking-tight">Profile</h1>
            <p className="text-gray-600 dark:text-gray-500 text-sm mt-1">Manage your account settings</p>
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl border ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-500/10 border-green-300 dark:border-green-500/20 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-500/10 border-red-300 dark:border-red-500/20 text-red-700 dark:text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white dark:bg-[#16161e] border border-gray-300 dark:border-white/10 rounded-2xl p-8 mb-6">
          {/* User Avatar */}
          <div className="flex items-center gap-6 mb-8 pb-8 border-b border-gray-300 dark:border-white/8">
            <div className="w-24 h-24 bg-gradient-to-br from-pink-500 to-orange-400 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
              {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-2xl font-black text-black dark:text-white">
                {user?.user_metadata?.full_name || 'User'}
              </h2>
              <p className="text-gray-600 dark:text-gray-500 text-sm">{user?.email}</p>
              <p className="text-gray-700 dark:text-gray-600 text-xs mt-2">
                Joined {new Date(user?.created_at || '').toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Edit Profile Form */}
          {isEditing ? (
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-violet-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-violet-500/50 transition-all"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-violet-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-black dark:text-white font-black py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4 p-4 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-300 dark:border-white/10">
                  <User className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest">Full Name</p>
                    <p className="text-black dark:text-white font-semibold">{formData.full_name || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-300 dark:border-white/10">
                  <Phone className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest">Phone</p>
                    <p className="text-black dark:text-white font-semibold">{formData.phone || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-300 dark:border-white/10">
                  <MapPin className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest">Location</p>
                    <p className="text-black dark:text-white font-semibold">{formData.location || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-300 dark:border-white/10">
                  <Mail className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest">Email</p>
                    <p className="text-black dark:text-white font-semibold break-all">{user?.email || 'Not set'}</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black py-3 rounded-xl transition-all"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            </div>
          )}
        </div>

        {/* Security Card */}
        <div className="bg-white dark:bg-[#16161e] border border-gray-300 dark:border-white/10 rounded-2xl p-8">
          <h3 className="text-xl font-black text-black dark:text-white uppercase tracking-tight mb-6 flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-500" />
            Security
          </h3>

          {isChangingPassword ? (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter new password"
                    className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-violet-500/50 transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 dark:text-gray-600 uppercase tracking-widest mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="Confirm new password"
                  className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-violet-500/50 transition-all"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  }}
                  className="flex-1 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-black dark:text-white font-black py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsChangingPassword(true)}
              className="w-full bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-black dark:text-white font-black py-3 rounded-xl transition-all"
            >
              Change Password
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
