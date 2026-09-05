# LoRA Info (header, tags, trigger words)

What a LoRA file can tell you. The loader gives MODEL and CLIP only; the information lives in the **.safetensors header**, written by the trainer.

## What is in the header
- sd-scripts / kohya trainings: ~80-90 keys — `ss_output_name`, `ss_base_model_version`, `ss_sd_model_name` (trained on), `ss_network_dim` / `ss_network_alpha`, `ss_steps`, `ss_num_train_images`, `ss_resolution`, `modelspec.*` (architecture, date, title), `ss_training_comment`, and **`ss_tag_frequency`**: the training captions' tags with their counts — the best local hint of the trigger words.
- Other trainers: often 5-10 keys (base model and a name), sometimes nothing.
- The **official** trigger words are *not* in the file: they are on Civitai. With `civitai` on, the node hashes the file (SHA-256, cached) and asks Civitai once; the answer is cached in `output/_wextrax/lora/`.

## Outputs
`name` (clean file name) · `base_model` · `trigger_words` (Civitai's when looked up, else the most frequent training tags) · `tags` (tag, count per line) · `info` (readable summary) · `metadata_json` (the whole header).

Quality boilerplate tags (masterpiece, best quality, highres…) are dropped from the candidates.

## Lists
`civitai_list` and `tags_list` are LIST outputs: the official Civitai words, and ALL training tags most frequent first (nothing dropped) — compatible with *Extract Tag from list*. To put words into a prompt in one node, use **LoRA Loader + Trigger**.
