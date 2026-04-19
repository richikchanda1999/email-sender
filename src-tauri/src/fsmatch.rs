pub fn normalize(s: &str, case_insensitive: bool, fuzzy: bool) -> String {
    let mut out = s.to_string();
    if case_insensitive {
        out = out.to_lowercase();
    }
    if fuzzy {
        out.retain(|c| !matches!(c, ' ' | '-' | '_'));
    }
    out
}

pub fn resolve_template(pattern: &str, row: &std::collections::HashMap<String, String>) -> String {
    let mut out = String::with_capacity(pattern.len());
    let bytes = pattern.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end) = pattern[i + 2..].find("}}") {
                let key = &pattern[i + 2..i + 2 + end];
                let key = key.trim();
                if let Some(v) = row.get(key) {
                    out.push_str(v);
                } else {
                    out.push_str("{{");
                    out.push_str(key);
                    out.push_str("}}");
                }
                i += 2 + end + 2;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}
