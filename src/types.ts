type App = {
	packageName: string;
	urlPath: string;
	version?: string;
};

type Opts = {
    arch: "universal" | "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64"
}

export type Config = { options?: Opts, apps: App[]};
