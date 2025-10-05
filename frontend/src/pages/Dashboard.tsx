import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Radio, Leaf } from "lucide-react";
import { TopNavigation } from "@/components/TopNavigation";
import { BudgetCard } from "@/components/BudgetCard";
import { SustainabilityCard } from "@/components/SustainabilityCard";
import { CartItem, CartItemType } from "@/components/CartItem";
import { GlassesVideoFeed } from "@/components/GlassesVideoFeed";
import { BudgetPreferencesDialog } from "@/components/BudgetPreferencesDialog";
import { SustainabilityMap } from "@/components/SustainabilityMap";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetchSustainabilityComment, playAudioFromBase64 } from "@/utils/audioUtils";
import { getCurrentLocation, formatLocation, LocationData } from "@/utils/locationUtils";
import { io, Socket } from 'socket.io-client';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<CartItemType[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [budget, setBudget] = useState(100);
  const [sustainabilityPreference, setSustainabilityPreference] = useState<'low' | 'medium' | 'high'>('medium');
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);
  const [hasSetPreferences, setHasSetPreferences] = useState(false);
  const [userLocation, setUserLocation] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lastDetectedObject, setLastDetectedObject] = useState<CartItemType | null>(null);
  const [lastDetectionTime, setLastDetectionTime] = useState<Date | null>(null);

  const totalSpent = items.reduce((sum, item) => sum + item.price, 0);
  const avgSustainability = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + item.sustainabilityScore, 0) / items.length)
    : 0;

  useEffect(() => {
    if (totalSpent > budget) {
      toast.error(`Budget Exceeded 💸`, {
        description: `You're over budget by $${(totalSpent - budget).toFixed(2)}`,
      });
    }
  }, [totalSpent, budget]);

  useEffect(() => {
    if (avgSustainability >= 80 && items.length > 0) {
      toast.success("Eco Hero 🌿", {
        description: "Your cart is 80%+ sustainable!",
      });
    }
  }, [avgSustainability, items.length]);

  // Show preferences dialog only when coming from home page, not from Analytics
  useEffect(() => {
    const isComingFromAnalytics = location.state?.from === 'analytics';
    if (!isComingFromAnalytics) {
      setShowPreferencesDialog(true);
    }
  }, [location.state]);

  // Fetch user location on component mount
  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const locationData = await getCurrentLocation();
        const formattedLocation = formatLocation(locationData);
        setUserLocation(formattedLocation);
      } catch (error) {
        console.error('Error fetching location:', error);
        setUserLocation('Location unavailable');
      }
    };

    fetchLocation();
  }, []);

  // Function to add cart item
  const addCartItem = (cartItem: CartItemType) => {
    console.log('Received cart item from backend:', cartItem);
    
    // Update last detected object
    setLastDetectedObject(cartItem);
    setLastDetectionTime(new Date());
    
    // Add the item to the cart
    setItems(prevItems => {
      // Check if item already exists (by ID)
      const existingItemIndex = prevItems.findIndex(item => item.id === cartItem.id);
      
      if (existingItemIndex !== -1) {
        // Update existing item (increment count or update price)
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          price: cartItem.price || updatedItems[existingItemIndex].price,
          sustainabilityScore: cartItem.sustainabilityScore || updatedItems[existingItemIndex].sustainabilityScore
        };
        toast.info(`Updated: ${cartItem.name}`);
        return updatedItems;
      } else {
        // Add new item
        toast.success(`Added to cart: ${cartItem.name}`);
        return [...prevItems, cartItem];
      }
    });
  };

  // WebSocket connection for real-time cart updates
  useEffect(() => {
    const newSocket = io('http://localhost:5008', {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to backend WebSocket for cart updates');
    });

    newSocket.on('cart_item_added', addCartItem);

    newSocket.on('disconnect', () => {
      console.log('Disconnected from backend WebSocket');
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  // File-based communication for cart items (alternative to WebSocket)
  useEffect(() => {
    let lastUpdateTime = '';
    
    const checkForUpdates = async () => {
      try {
        const response = await fetch('/cart_updates.json');
        if (response.ok) {
          const update = await response.json();
          if (update && update.timestamp !== lastUpdateTime && update.type === 'cart_item_added') {
            lastUpdateTime = update.timestamp;
            addCartItem(update.cart_item);
          }
        }
      } catch (error) {
        // Silently handle errors - cart updates are optional
      }
    };

    // Check for updates every 1 second
    const interval = setInterval(checkForUpdates, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
    toast.info("Item removed from cart");
  };

  const handleSyncToggle = (checked: boolean) => {
    setSyncEnabled(checked);
    if (checked) {
      toast.info("Glasses camera enabled", {
        description: "Camera access requested for glasses view...",
      });
    } else {
      toast.info("Glasses camera disabled");
    }
  };

  const handleSavePreferences = async (newBudget: number, newSustainabilityPreference: 'low' | 'medium' | 'high') => {
    setBudget(newBudget);
    setSustainabilityPreference(newSustainabilityPreference);
    setHasSetPreferences(true);
    
    const preferenceLabel = newSustainabilityPreference === 'high' ? 'Eco Conscious' : 
                           newSustainabilityPreference === 'medium' ? 'Balanced' : 'Budget Focused';
    
    toast.success("Preferences updated!", {
      description: `Budget: $${newBudget} • ${preferenceLabel}`
    });

    // Play ElevenLabs audio comment
    try {
      const audioData = await fetchSustainabilityComment(newSustainabilityPreference);
      
      if (audioData.success && audioData.audio) {
        await playAudioFromBase64(audioData.audio);
      } else {
        // Fallback: show the comment as text if audio fails
        console.log("Audio generation failed, showing text comment:", audioData.comment);
        toast.info("Great choice!", {
          description: audioData.comment
        });
      }
    } catch (error) {
      console.error("Error playing audio comment:", error);
      // Silently fail - don't interrupt the user experience
    }
  };

  const handleClosePreferencesDialog = () => {
    setShowPreferencesDialog(false);
    if (!hasSetPreferences) {
      // If user closes without setting preferences, use defaults
      setHasSetPreferences(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation username="Manoj" budget={budget} location={userLocation} />
      
      {/* Preferences Dialog */}
      <BudgetPreferencesDialog
        isOpen={showPreferencesDialog}
        onSave={handleSavePreferences}
        onClose={handleClosePreferencesDialog}
      />
      
      <main className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column - Video Feed */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="sticky top-8">
              <GlassesVideoFeed isActive={syncEnabled} />
            </div>
          </div>

          {/* Right Column - Main Content */}
          <div className="flex-1 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
                <p className="text-muted-foreground">Track your cart in real-time</p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border border-border">
                  <Radio className={`w-4 h-4 ${syncEnabled ? 'text-success animate-pulse' : 'text-muted-foreground'}`} />
                  <Label htmlFor="sync" className="text-sm font-medium">Glasses Camera</Label>
                  <Switch
                    id="sync"
                    checked={syncEnabled}
                    onCheckedChange={handleSyncToggle}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <BudgetCard spent={totalSpent} budget={budget} />
              <SustainabilityCard score={avgSustainability} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-foreground">
                  Current Items in Cart
                  {items.length > 0 && (
                    <span className="ml-3 text-lg text-muted-foreground">({items.length})</span>
                  )}
                </h2>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-16 bg-card rounded-lg border border-dashed border-border">
                  <p className="text-muted-foreground text-lg mb-4">Your cart is empty</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Add items using the button above or enable glasses camera
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/")}
                  >
                    Back to Home
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <CartItem key={item.id} item={item} onRemove={handleRemoveItem} />
                  ))}
                </div>
              )}
            </div>

            {/* Last Detected Object */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-foreground">
                  Last Detected Object
                </h2>
              </div>
              
              {lastDetectedObject ? (
                <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground text-lg">
                        {lastDetectedObject.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Sustainability: {lastDetectedObject.sustainabilityScore}%
                        </span>
                      </div>
                      {lastDetectionTime && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Detected: {lastDetectionTime.toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <span className="text-lg font-semibold text-foreground">
                        ${lastDetectedObject.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 bg-card rounded-lg border border-dashed border-border">
                  <p className="text-muted-foreground text-lg mb-2">No objects detected yet</p>
                  <p className="text-sm text-muted-foreground">
                    Point the camera at objects to see them appear here
                  </p>
                </div>
              )}
            </div>

            {/* Sustainability Map */}
            <SustainabilityMap currentSustainabilityScore={avgSustainability} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
