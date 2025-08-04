import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MsalService, MsalBroadcastService, MSAL_GUARD_CONFIG, MsalGuardConfiguration } from '@azure/msal-angular';
import { InteractionStatus, RedirectRequest, AuthenticationResult, AccountInfo } from '@azure/msal-browser';
import { Subject, filter, takeUntil } from 'rxjs';

interface TodoItem {
  id: number;
  title: string;
  description: string;
  isCompleted: boolean;
  createdDate: Date;
  updatedDate: Date;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'TODO App';
  isIframe = false;
  loginDisplay = false;
  userProfile: any = null;
  loginInProgress = false;
  isInitializing = true; // Add loading state to prevent flash
  private readonly _destroying$ = new Subject<void>();

  todos: TodoItem[] = [];
  newTodo = { title: '', description: '' };
  editingTodo: TodoItem | null = null;
  private apiUrl = 'http://localhost:5000/api/todos';

  constructor(
    @Inject(MSAL_GUARD_CONFIG) private msalGuardConfig: MsalGuardConfiguration,
    private broadcastService: MsalBroadcastService,
    private authService: MsalService,
    private http: HttpClient,
    private router: Router
  ) {
    // Try to detect authentication state immediately in constructor
    this.preInitializeAuthState();
  }

  /**
   * Pre-initialize authentication state before ngOnInit to prevent flash
   */
  private preInitializeAuthState() {
    try {
      // Check if MSAL instance is already available
      const accounts = this.authService.instance?.getAllAccounts();
      if (accounts && accounts.length > 0) {
        this.loginDisplay = true;
        this.isInitializing = false;
      }
    } catch (error) {
      // Instance might not be ready yet, will handle in ngOnInit
    }
  }

  /**
   * Component initialization - sets up MSAL authentication and handles redirect flows
   */
  async ngOnInit() {
    this.isIframe = window !== window.parent && !window.opener;
    
    // Set up broadcast service listeners first to catch any state changes
    this.setupBroadcastListeners();
    
    try {
      // Initialize MSAL instance
      await this.authService.instance.initialize();
      
      // Handle redirect promise first (for returning from authentication)
      const redirectResult = await this.authService.instance.handleRedirectPromise();
      
      if (redirectResult?.account) {
        // Set the account as active immediately after successful authentication
        this.authService.instance.setActiveAccount(redirectResult.account);
        this.loginDisplay = true;
        this.isInitializing = false;
        
        // Navigate back to home if we're on the callback route
        if (this.router.url.includes('/callback')) {
          await this.router.navigate(['/']);
        }
        
        // Update UI immediately
        this.getUserProfile();
        this.loadTodos();
        return; // Exit early, we're authenticated
      }
      
      // Check for existing accounts if no redirect result
      const existingAccounts = this.authService.instance.getAllAccounts();
      if (existingAccounts.length > 0) {
        this.authService.instance.setActiveAccount(existingAccounts[0]);
        this.loginDisplay = true;
        this.getUserProfile();
        this.loadTodos();
      }
      
    } catch (error) {
      console.error('MSAL initialization or redirect handling failed:', error);
    } finally {
      // Always complete initialization to show appropriate UI
      this.isInitializing = false;
    }
  }

  /**
   * Sets up MSAL broadcast service listeners
   */
  private setupBroadcastListeners() {
    // Listen for authentication state changes
    this.broadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None),
        takeUntil(this._destroying$)
      )
      .subscribe(() => {
        this.loginInProgress = false;
        this.setLoginDisplay();
        this.checkAndSetActiveAccount();
      });
      
    // Listen for login success events
    this.broadcastService.msalSubject$
      .pipe(
        filter((msg: any) => msg.eventType === 'msal:loginSuccess'),
        takeUntil(this._destroying$)
      )
      .subscribe((result: any) => {
        // Navigate to home if we're on callback
        if (this.router.url.includes('/callback')) {
          this.router.navigate(['/']);
        }
        this.setLoginDisplay();
        this.checkAndSetActiveAccount();
      });
  }

  /**
   * Updates the login display state and loads user data if authenticated
   */
  setLoginDisplay() {
    const accounts = this.authService.instance.getAllAccounts();
    const activeAccount = this.authService.instance.getActiveAccount();
    this.loginDisplay = accounts.length > 0;
    
    if (this.loginDisplay && accounts.length > 0) {
      // Ensure we have an active account set
      if (!activeAccount) {
        this.authService.instance.setActiveAccount(accounts[0]);
      }
      
      // Get user profile and load data
      this.getUserProfile();
      this.loadTodos();
    } else {
      // Clear user data when not logged in
      this.userProfile = null;
      this.todos = [];
    }
  }

  /**
   * Ensures an active account is set if accounts exist
   */
  checkAndSetActiveAccount() {
    let activeAccount = this.authService.instance.getActiveAccount();

    if (!activeAccount && this.authService.instance.getAllAccounts().length > 0) {
      let accounts = this.authService.instance.getAllAccounts();
      this.authService.instance.setActiveAccount(accounts[0]);
    }
  }

  /**
   * Initiates Azure AD login flow with v2.0 endpoint
   */
  async login() {
    // Prevent multiple simultaneous login attempts
    if (this.loginInProgress) {
      return;
    }

    this.loginInProgress = true;

    try {
      // Check for existing accounts and clear cache if needed to prevent conflicts
      const existingAccounts = this.authService.instance.getAllAccounts();
      if (existingAccounts.length > 0) {
        await this.authService.instance.clearCache();
      }
      
      // Configure login request for v2.0 endpoint
      const loginRequest = {
        scopes: ['openid', 'profile', 'email'],
        authority: 'https://login.microsoftonline.com/52451440-c2a9-442f-8c20-8562d49f6846/v2.0',
        prompt: 'login',
        extraQueryParameters: {
          'response_mode': 'fragment'
        }
      };
      
      this.authService.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login error:', error);
      this.loginInProgress = false;
    }
  }

  /**
   * Logs out the user and clears all cached data
   */
  async logout() {
    try {
      await this.authService.instance.clearCache();
      this.authService.logoutRedirect({
        postLogoutRedirectUri: 'http://localhost:4200'
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Extracts user profile information from the active account
   */
  getUserProfile() {
    const activeAccount = this.authService.instance.getActiveAccount();
    if (activeAccount) {
      this.userProfile = {
        name: activeAccount.name,
        email: activeAccount.username,
        id: activeAccount.localAccountId
      };
    }
  }

  /**
   * Gets authorization headers with access token for API requests
   * @returns Promise<HttpHeaders> - Headers with Bearer token or just content-type
   */
  private async getAuthHeaders(): Promise<HttpHeaders> {
    const account = this.authService.instance.getActiveAccount();
    if (account) {
      try {
        // Request access token with explicit v2.0 authority
        const tokenRequest = {
          account: account,
          scopes: ['01d37875-07ee-427e-8be5-594fbe4c5632/.default'],
          authority: 'https://login.microsoftonline.com/52451440-c2a9-442f-8c20-8562d49f6846/v2.0',
          forceRefresh: true,
          extraQueryParameters: {
            'response_mode': 'fragment'
          }
        };
        
        const tokenResponse = await this.authService.acquireTokenSilent(tokenRequest).toPromise();
        
        if (tokenResponse?.accessToken) {
          return new HttpHeaders({
            'Authorization': `Bearer ${tokenResponse.accessToken}`,
            'Content-Type': 'application/json'
          });
        }
      } catch (error) {
        console.error('Token acquisition failed:', error);
        // Continue without authorization header
      }
    }
    
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  /**
   * Loads all TODOs for the authenticated user from the API
   */
  async loadTodos() {
    try {
      const headers = await this.getAuthHeaders();
      this.http.get<TodoItem[]>(this.apiUrl, { headers })
        .subscribe({
          next: (todos) => this.todos = todos,
          error: (error) => console.error('Error loading todos:', error)
        });
    } catch (error) {
      console.error('Error getting auth headers for loading todos:', error);
    }
  }

  /**
   * Creates a new TODO item
   */
  async addTodo() {
    if (this.newTodo.title.trim()) {
      try {
        const todo = {
          title: this.newTodo.title,
          description: this.newTodo.description,
          isCompleted: false
        };

        const headers = await this.getAuthHeaders();
        this.http.post<TodoItem>(this.apiUrl, todo, { headers })
          .subscribe({
            next: (createdTodo) => {
              this.todos.push(createdTodo);
              this.newTodo = { title: '', description: '' };
            },
            error: (error) => console.error('Error adding todo:', error)
          });
      } catch (error) {
        console.error('Error getting auth headers for adding todo:', error);
      }
    }
  }

  /**
   * Enters edit mode for a TODO item
   * @param todo - The TODO item to edit
   */
  editTodo(todo: TodoItem) {
    this.editingTodo = { ...todo };
  }

  /**
   * Updates an existing TODO item
   */
  async updateTodo() {
    if (this.editingTodo) {
      try {
        const headers = await this.getAuthHeaders();
        this.http.put<TodoItem>(`${this.apiUrl}/${this.editingTodo.id}`, this.editingTodo, { headers })
          .subscribe({
            next: (updatedTodo) => {
              const index = this.todos.findIndex(t => t.id === updatedTodo.id);
              if (index !== -1) {
                this.todos[index] = updatedTodo;
              }
              this.editingTodo = null;
            },
            error: (error) => console.error('Error updating todo:', error)
          });
      } catch (error) {
        console.error('Error getting auth headers for updating todo:', error);
      }
    }
  }

  /**
   * Deletes a TODO item
   * @param id - The ID of the TODO item to delete
   */
  async deleteTodo(id: number) {
    try {
      const headers = await this.getAuthHeaders();
      this.http.delete(`${this.apiUrl}/${id}`, { headers })
        .subscribe({
          next: () => {
            this.todos = this.todos.filter(t => t.id !== id);
          },
          error: (error) => console.error('Error deleting todo:', error)
        });
    } catch (error) {
      console.error('Error getting auth headers for deleting todo:', error);
    }
  }

  /**
   * Toggles the completion status of a TODO item
   * @param todo - The TODO item to toggle
   */
  async toggleComplete(todo: TodoItem) {
    try {
      todo.isCompleted = !todo.isCompleted;
      const headers = await this.getAuthHeaders();
      this.http.put<TodoItem>(`${this.apiUrl}/${todo.id}`, todo, { headers })
        .subscribe({
          next: (updatedTodo) => {
            const index = this.todos.findIndex(t => t.id === updatedTodo.id);
            if (index !== -1) {
              this.todos[index] = updatedTodo;
            }
          },
          error: (error) => console.error('Error updating todo:', error)
        });
    } catch (error) {
      console.error('Error getting auth headers for toggling todo:', error);
    }
  }

  /**
   * Cancels the current edit operation
   */
  cancelEdit() {
    this.editingTodo = null;
  }

  /**
   * Component cleanup - unsubscribes from all observables
   */
  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
