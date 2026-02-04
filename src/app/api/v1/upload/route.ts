import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import crypto from "crypto";

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types for proof uploads
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/json",
];

// POST /api/v1/upload - Upload a file (for proof attachments)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ success: false, error: "User profile not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const purpose = formData.get("purpose") as string || "proof";

    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: "No file provided" 
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        success: false, 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        success: false, 
        error: `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}` 
      }, { status: 400 });
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate SHA256 hash
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Generate unique filename
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "bin";
    const filename = `${purpose}/${profile.id}/${timestamp}-${hash.slice(0, 8)}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("proofs")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // Storage bucket might not exist - provide helpful error
      if (uploadError.message.includes("bucket")) {
        return NextResponse.json({ 
          success: false, 
          error: "Storage not configured. Please create 'proofs' bucket in Supabase Storage.",
          setup_required: true,
        }, { status: 500 });
      }
      return NextResponse.json({ 
        success: false, 
        error: uploadError.message 
      }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("proofs")
      .getPublicUrl(filename);

    const proofMetadata = {
      hash: `sha256:${hash}`,
      file_type: file.type,
      file_size: file.size,
      original_name: file.name,
      uploaded_at: new Date().toISOString(),
      uploaded_by: profile.id,
    };

    return NextResponse.json({
      success: true,
      proof_url: urlData.publicUrl,
      proof_metadata: proofMetadata,
      path: uploadData.path,
      message: "File uploaded successfully. Include proof_url and proof_metadata when submitting work.",
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ 
      success: false, 
      error: errorMessage 
    }, { status: 500 });
  }
}
