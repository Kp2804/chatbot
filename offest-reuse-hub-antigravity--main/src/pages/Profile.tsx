/**
 * @file Profile.tsx
 * @description User account settings page for managing personal profile information.
 * 
 * Key Features:
 * - Fetches the authenticated user's current profile from the `profiles` table
 * - Allows updating `full_name` and `company` fields
 * - Email address is treated as read-only since it's managed by Supabase Auth
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { User, Building, Mail, Loader2 } from 'lucide-react';

const Profile = () => {
    const { user, isLoading: authLoading } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [fullName, setFullName] = useState('');
    const [company, setCompany] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            navigate('/login');
        }
    }, [user, authLoading, navigate]);

    useEffect(() => {
        if (user) {
            fetchProfile();
        }
    }, [user]);

    const fetchProfile = async () => {
        if (!user) return;
        setIsLoading(true);

        const { data, error } = await supabase
            .from('profiles')
            .select('full_name, company')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            toast({
                title: 'Error',
                description: 'Failed to load profile details.',
                variant: 'destructive',
            });
        } else if (data) {
            setFullName(data.full_name || '');
            setCompany(data.company || '');
        }
        setIsLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsSaving(true);
        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: fullName,
                company: company,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

        setIsSaving(false);

        if (error) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Profile Updated',
                description: 'Your details have been saved successfully.',
            });
        }
    };

    if (authLoading || isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar isLoggedIn={!!user} userName={fullName || user?.email?.split('@')[0]} />

            <main className="flex-1 py-12">
                <div className="container max-w-2xl">
                    <h1 className="mb-8 text-3xl font-bold">Account Settings</h1>

                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Information</CardTitle>
                            <CardDescription>
                                Update your personal and company details.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSave} className="space-y-6">

                                {/* Email (Read Only) */}
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="email"
                                            value={user?.email || ''}
                                            disabled
                                            className="pl-10 bg-muted"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Email address cannot be changed.
                                    </p>
                                </div>

                                {/* Full Name */}
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="fullName"
                                            placeholder="John Doe"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                {/* Company */}
                                <div className="space-y-2">
                                    <Label htmlFor="company">Company Name</Label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="company"
                                            placeholder="Acme Prints Ltd."
                                            value={company}
                                            onChange={(e) => setCompany(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default Profile;
